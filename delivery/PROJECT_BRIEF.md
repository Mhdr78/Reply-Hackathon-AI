# Problem, idea, users and success measures

## Problem and affected users

University students reviewing recorded lectures often have to scrub through long
videos, search disconnected slides and reconstruct the explanation around a
formula. Students studying in a second language face an additional comprehension
barrier. A transcript alone does not reliably connect an answer to its source.

These are the team's problem assumptions. This prototype does not claim survey
results, measured learning gains or adoption statistics.

## Idea in plain language

Give the assistant a lecture recording and its supporting PDFs. It produces a
transcript, finds relevant passages and document pages, and explains the material
in English or Italian with links back to the evidence. Students may translate
the transcript without changing the original video or its timeline.

## Target user and context

The first user is an English/Italian-speaking university student revising a
technical course on a laptop, after class or before an exam. The prototype
supports a local single-user workflow. The Polimi branding, login and course
catalog are demo UI, not an institutional integration or endorsement.

## Use scenario in a real moment

A student revising neural networks cannot understand why a weight matrix has
I+1 columns. They open the lecture, select the relevant minute and ask the
question in English while choosing Italian for the response. The assistant
explains the bias term and attaches original video times and relevant PDF pages.
The student clicks a citation to inspect the lecturer's explanation, then
switches the transcript to Italian and continues watching the original recording.

If they ask what the lecture teaches about photosynthesis and the indexed
material does not cover it, the assistant reports insufficient evidence rather
than supplying an unrelated answer with invented references.

## Success measures: evidence versus next experiments

| Measure | Delivery evidence | Next validation |
| --- | --- | --- |
| Find expected evidence | All four positive expectations retrieved in top 5 on one labeled sample | Larger held-out English/Italian lecture set, source recall and precision |
| Respect missing evidence | One live out-of-scope question refused, with no citations | More adversarial and partly answerable questions; false-answer rate |
| Respond in the chosen language | Live English-question/Italian-answer browser check | Independent terminology/translation review by bilingual students |
| Trace an explanation to a source | Live video citations and PDF page 25 navigation | Audit every claim and click target across more recordings |
| Keep review interactive | 1.2–5.5 seconds/question in the five-case RAG smoke test | Cold starts, long recordings, sustained load and percentile latency |
| Respect the small API budget | $0.00876695 reported for successful requests in the recorded five-case run | Account-wide monitoring across translation, teammates and all applications |
| Improve revision | Not measured | Compare task completion time and comprehension against manual video/PDF search |

The included real sample data support reproducing these sample-specific checks.
No numerical learning-improvement, production-scale accuracy or three-hour
processing claim should be made from the current evidence.
