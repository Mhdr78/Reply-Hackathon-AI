"""Qdrant local persistence or remote server through the same API."""

from qdrant_client import QdrantClient, models


class VectorStore:
    def __init__(self, settings):
        self.name = settings.collection_name
        self.remote = bool(settings.qdrant_url)
        self.client = (QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None, timeout=30)
                       if self.remote else QdrantClient(path=str(settings.data_dir / "qdrant")))

    def close(self):
        self.client.close()

    @staticmethod
    def filter(scope, version):
        return models.Filter(must=[models.FieldCondition(key="scope", match=models.MatchValue(value=scope)),
                                   models.FieldCondition(key="version", match=models.MatchValue(value=version))])

    def ready(self, manifest):
        return (self.client.collection_exists(self.name)
                and self.client.count(self.name, count_filter=self.filter(manifest["scope"], manifest["version"]), exact=True).count == manifest["chunk_count"])

    def upsert(self, chunks, vectors):
        if len(chunks) != len(vectors) or not vectors:
            raise ValueError("Each chunk needs an embedding vector.")
        dimension = len(vectors[0])
        if not self.client.collection_exists(self.name):
            self.client.create_collection(self.name, vectors_config=models.VectorParams(size=dimension, distance=models.Distance.COSINE))
            if self.remote:
                for key in ("scope", "version", "source_type"):
                    self.client.create_payload_index(self.name, key, field_schema=models.PayloadSchemaType.KEYWORD, wait=True)
        config = self.client.get_collection(self.name).config.params.vectors
        if config.size != dimension or any(len(v) != dimension for v in vectors):
            raise ValueError("Qdrant vector dimensions do not match this embedding model.")
        for offset in range(0, len(chunks), 64):
            points = [models.PointStruct(id=c["chunk_id"], vector=v, payload=c)
                      for c, v in zip(chunks[offset:offset + 64], vectors[offset:offset + 64])]
            self.client.upsert(self.name, points=points, wait=True)

    def search(self, vector, scope, version, limit=20):
        if not self.client.collection_exists(self.name):
            raise ValueError("Qdrant collection is missing; reindex the lecture.")
        points = self.client.query_points(self.name, query=vector, query_filter=self.filter(scope, version),
                                          limit=limit, with_payload=True).points
        return [{**point.payload, "dense_score": point.score} for point in points]

    def prune(self, scope, active_version):
        query = models.Filter(must=[models.FieldCondition(key="scope", match=models.MatchValue(value=scope))],
                              must_not=[models.FieldCondition(key="version", match=models.MatchValue(value=active_version))])
        self.client.delete(self.name, points_selector=models.FilterSelector(filter=query), wait=True)
