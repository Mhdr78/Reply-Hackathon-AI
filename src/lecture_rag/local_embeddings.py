"""CPU embeddings without sending source text to an external inference API."""

import math

from .chunks import split_text


class LocalEmbeddings:
    def __init__(self, settings):
        from fastembed import TextEmbedding

        self.model = TextEmbedding(
            model_name=settings.embedding_model.removeprefix("local/"),
            cache_dir=str(settings.data_dir / "models"), threads=4,
            providers=["CPUExecutionProvider"],
        )

    def embed(self, texts):
        # The local model has a smaller context than hosted embeddings. Split
        # oversized inputs, then pool all windows: never silently drop the tail.
        tokenizer = self.model.model.tokenizer
        parts, groups = [], []
        for text in texts:
            pending, group = [text], []
            while pending:
                part = pending.pop(0)
                encoded = tokenizer.encode(part)
                if encoded.overflowing:
                    children = split_text(part, limit=max(8, len(part.encode()) // 2))
                    if len(children) < 2:
                        raise ValueError("Local embedding tokenizer could not split this input safely.")
                    pending[:0] = children
                else:
                    group.append((len(parts), max(1, len(encoded.ids) - 2)))
                    parts.append(part)
            groups.append(group)
        vectors = list(self.model.embed(parts, batch_size=16))
        pooled = []
        for group in groups:
            total = sum(weight for _, weight in group)
            value = [sum(float(vectors[index][dim]) * weight for index, weight in group) / total
                     for dim in range(len(vectors[group[0][0]]))]
            norm = math.sqrt(sum(v * v for v in value))
            if not norm or not math.isfinite(norm):
                raise ValueError("Local embedding produced an invalid vector.")
            pooled.append([v / norm for v in value])
        return pooled
