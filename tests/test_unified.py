"""Exercise browser-facing routes using real local Qdrant and unpaid providers."""
import copy
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from lecture_rag import RagService, Settings
from lecture_rag.unified_api import AppService, create_app
from lecture_translation.core import assemble_translation, DEFAULT_MODEL
from test_rag import transcript, FakeProvider

class UnifiedTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.rag = RagService(Settings(data_dir=self.root/'rag'), provider=FakeProvider())
        self.service = AppService(self.root, rag=self.rag)
        self.client = TestClient(create_app(self.service))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None,None,None)
        self.tmp.cleanup()

    def upload(self):
        raw=transcript('ml-01')
        r=self.client.post('/api/lectures/ml-01/sources',files=[('files',('source.json',json.dumps(raw),'application/json'))])
        self.assertEqual(r.status_code,200,r.text)
        return raw

    def test_upload_transcript_chat_language_and_persisted_citations(self):
        self.upload()
        self.assertEqual(self.client.get('/api/lectures/ml-01/transcription').json()['status'],'completed')
        self.assertEqual(self.client.get('/api/lectures/ml-01/transcript').json()['lectureId'],'ml-01')
        cid=self.client.post('/api/lectures/ml-01/chats',json={}).json()['id']
        answer=self.client.post(f'/api/chats/{cid}/messages',json={'content':'Explain bias','response_language':'it','selection':{'start':11,'end':15}})
        self.assertEqual(answer.status_code,200,answer.text)
        self.assertIn('La colonna',answer.json()['assistant']['content'])
        self.assertTrue(answer.json()['sources'])
        self.assertIn(' s]',answer.json()['assistant']['content'])
        self.assertEqual(len(self.client.get(f'/api/chats/{cid}/messages').json()),2)
        self.assertEqual(self.client.post(f'/api/chats/{cid}/messages',json={'content':'bias','response_language':'xx'}).status_code,422)

    def test_translation_job_is_cached_and_source_change_invalidates_it(self):
        self.upload()
        def translate(source,target):
            result={'units':[{'source_segment_ids':[s['segment_id']],'text':'Traduzione: '+s['text']} for s in source['segments']]}
            return assemble_translation(source,target,DEFAULT_MODEL,{'choices':[{'finish_reason':'stop','message':{'content':json.dumps(result)}}]})
        path='/api/lectures/ml-01/translations/it'
        self.assertEqual(self.client.get(path).json()['status'],'not_started')
        with patch('lecture_rag.unified_api.translate_transcript',side_effect=translate) as translator:
            self.client.post(path)
            for _ in range(100):
                result=self.client.get(path).json()
                if result['status'] not in ('queued','processing'):break
                time.sleep(.01)
            self.assertEqual(result['status'],'completed',result)
            self.assertEqual(result['transcript']['language'],'it')
            self.assertEqual(result['transcript']['artifact_type'],'translated_transcript')
            rejected=self.client.post('/api/lectures/ml-01/sources',files=[('files',('translation.json',json.dumps(result['transcript']),'application/json'))])
            self.assertEqual(rejected.status_code,422)
            self.assertEqual(result['transcript']['segments'][0]['start'],10)
            self.client.post(path)
            self.assertEqual(translator.call_count,1)
            changed=transcript('ml-01');changed['segments'][0]['text']='Different source'
            self.client.post('/api/lectures/ml-01/sources',files=[('files',('new.json',json.dumps(changed),'application/json'))])
            self.assertEqual(self.client.get(path).json()['status'],'not_started')

    def test_multiple_pdf_upload_and_invalid_json_preserve_original(self):
        self.upload()
        writer=PdfWriter();writer.add_blank_page(width=100,height=100);pdf=io.BytesIO();writer.write(pdf)
        response=self.client.post('/api/lectures/ml-01/sources',files=[('files',('one.pdf',pdf.getvalue(),'application/pdf')),('files',('two.pdf',pdf.getvalue(),'application/pdf'))])
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(len(self.service.documents('ml-01')),2)
        self.client.post('/api/lectures/ml-01/sources',files=[('files',('one.pdf',pdf.getvalue(),'application/pdf'))])
        self.assertEqual(self.service.documents('ml-01')[0]['name'],'one.pdf')
        self.assertEqual(self.client.get('/media/ml-01/one.pdf').status_code,200)
        invalid=self.client.post('/api/lectures/ml-01/sources',files=[('files',('bad.json','{}','application/json'))])
        self.assertEqual(invalid.status_code,422)
        self.assertEqual(len(self.service.original('ml-01')['segments']),2)

    def test_whole_lecture_summary_and_chapters_use_budgeted_provider(self):
        self.upload()
        cid=self.client.post('/api/lectures/ml-01/chats',json={}).json()['id']
        summary={'status':'answered','paragraphs':[{'text':'Bias and activation functions.','source_ids':['S1']}]}
        with patch.object(self.rag.provider,'structured',return_value=summary):
            result=self.client.post(f'/api/chats/{cid}/messages',json={'content':'Summarize this lecture'})
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['retrieval']['mode'],'whole_lecture')
        with patch.object(self.rag.provider,'structured',return_value={'chapters':[{'title':'Introduction','start_segment_id':'s0'}]}) as model:
            result=self.client.post('/api/lectures/ml-01/chapters',json={})
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['chapters'][0]['title'],'Introduction')
            self.client.post('/api/lectures/ml-01/chapters',json={})
            self.assertEqual(model.call_count,1)

    def test_new_video_archives_old_transcript_instead_of_using_stale_sources(self):
        self.upload()
        result=self.client.post('/api/lectures/ml-01/sources',files=[('files',('new.mp4',b'video fixture','video/mp4'))])
        self.assertEqual(result.status_code,200,result.text)
        self.assertFalse(self.client.get('/api/lectures/ml-01').json()['prepared'])
        self.assertEqual(len(list((self.service.data/'archived').glob('ml-01-*.json'))),1)
