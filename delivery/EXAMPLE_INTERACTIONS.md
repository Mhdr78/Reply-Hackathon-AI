# Recorded example interactions

These are recorded outputs from the real sample smoke test, not new calls or invented evaluation results. The original sample was English and about 15 minutes long. Its class media are included in the with-data package as the prepared `ml-01` demo. The separate browser smoke test also verified an English question with an Italian answer.

Source IDs below refer to the evidence table within that example. The UI converts them to clickable times/PDF pages. Source ranges are approximate ASR ranges, not proof of sentence-exact alignment.

## matrix-bias-en

**Student:** Why does the first weight matrix have I+1 columns instead of I columns?

**Requested answer language:** en
**Status:** `answered`

**Observed assistant response:**

The extra column represents the bias term. The first layer takes I input values, and the weight matrix includes one additional input for the bias, making I+1 columns. Equivalently, the weighted sum uses the I ordinary inputs plus a bias contribution; the lecturer describes this as a fictitious neuron used to compute the layer’s bias. [S1] [S2] [S3]

| Source | Supporting location |
| --- | --- |
| S1 | Original video 359.10–606.44 seconds |
| S2 | Original video 0.86–215.38 seconds |
| S3 | Original video 331.62–366.56 seconds |

## matrix-bias-it

**Student:** Perché la matrice dei pesi del primo livello ha I+1 colonne invece di I?

**Requested answer language:** it
**Status:** `answered`

**Observed assistant response:**

La matrice ha I+1 colonne perché, oltre agli I ingressi effettivi, si include un ingresso aggiuntivo costante pari a 1, associato al peso del bias. Così il bias può essere incorporato nella stessa somma pesata degli ingressi; per ciascun neurone del livello successivo si considerano quindi I+1 valori in ingresso. Se ci sono J neuroni in quel livello, la matrice ha J righe e I+1 colonne. [S2] [S4] [S5]

| Source | Supporting location |
| --- | --- |
| S2 | Original video 359.10–606.44 seconds |
| S4 | PDF page 8 |
| S5 | PDF page 7 |

## activation-slides-en

**Student:** Which activation functions and their derivatives are listed on the slides?

**Requested answer language:** en
**Status:** `answered`

**Observed assistant response:**

The slides list three activation functions and their derivatives: **Linear**: \(g(a)=a\), \(g'(a)=1\); **Sigmoid**: \(g(a)=\frac{1}{1+\exp(-a)}\), \(g'(a)=g(a)(1-g(a))\); and **Tanh**: \(g(a)=\frac{\exp(a)-\exp(-a)}{\exp(a)+\exp(-a)}\), \(g'(a)=1-g(a)^2\). [S1]

| Source | Supporting location |
| --- | --- |
| S1 | PDF page 18 |

## outside-material

**Student:** What does this lecture teach about photosynthesis in plant leaves?

**Requested answer language:** en
**Status:** `insufficient_evidence`

**Observed assistant response:**

The indexed lecture and documents do not provide enough evidence to answer this question.

**Boundary held:** no supporting evidence was found, and the response contains no citations. This one refusal is evidence from a smoke test, not a guarantee for all unsupported questions.

## Other integrated paths

- `Summarize this lecture` without selection was tested through the unified HTTP API: 200 response, whole-lecture mode, five original transcript chunks used as evidence.
- Transcript Italiano was loaded from a previously validated saved track. It was not retranslated during that browser check.
- PDF citation navigation was verified in the browser at page 25.

For machine-readable records, see `recorded_examples.json`. The hand-authored fixture in `sample_data/` is different content and should not be described as the source of these recorded results.
