import type { Transcript, TranscriptSegment } from '@/types/domain';
import { planBoundaries, type ChapterDraft } from '@/services/chapters/chapterizer';

/**
 * MOCK chapter titles. Placeholder until the LLM step exists: boundaries come from pauses in the transcript,
 * titles from the most distinctive key phrases of each chapter (TF-IDF over chapters), summaries from the
 * most representative sentence. Good enough to exercise the UI; an LLM will produce far better titles.
 */

const STOP = new Set(
  `a about above after again all also am an and any are aren't as at be because been before being below between both but by
  can can't cannot could couldn't did didn't do does doesn't doing don't down during each even every few for from further get
  gets getting go goes going gonna got had has have having he her here hers him his how i i'd i'll i'm i've if in into is isn't
  it it's its itself just kind know let let's like little lot lots maybe me mean means more most much must my need now of off
  ok okay on once one only or other our ours out over own please pretty quite rather really right said same say says see she
  should so some something sort still such sure take than thank thanks that that's the their them then there there's these
  they thing things think this those though through to today too two under until up us use used using very want was way we
  we'll we're we've well were what what's when where which while who whom why will with without would yeah yes you you'll
  you're your yours actually basically course different example first good give given gives instance last lecture look make
  makes many next new part point professor question several start talk time true try word words yeah able always already
  another anything around back called case come comes done else enough everything fact far going hand having idea important
  keep less long means mention mentioned never nothing number often order people put remember second simply since sorry
  sometimes thing tell three told usually whatever whole wrong`.split(/\s+/),
);

const tokenize = (s: string) => s.toLowerCase().replace(/[–—]/g, '-').match(/[a-zà-ù][a-zà-ù'-]*[a-zà-ù]|[a-z]/g) ?? [];
const content = (w: string) => w.length > 2 && !STOP.has(w);

/** Key phrases of a text: content unigrams and bigrams of adjacent content words. */
function phrases(text: string): string[] {
  const out: string[] = [];
  const toks = tokenize(text);
  toks.forEach((w, i) => {
    if (!content(w)) return;
    out.push(w);
    const n = toks[i + 1];
    if (n && content(n) && n !== w) out.push(`${w} ${n}`);
  });
  return out;
}

const titleCase = (p: string) => {
  const s = p.replace(/(^|[\s-])([a-zà-ù])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  return s.length <= 4 ? s.toUpperCase() : s;
};

/** Chooses up to two distinctive phrases per chapter and joins them into a title. */
function titlesFor(chunks: TranscriptSegment[][]): string[] {
  const counts = chunks.map((segs) => {
    const m = new Map<string, number>();
    segs.forEach((s) => phrases(s.text).forEach((p) => m.set(p, (m.get(p) ?? 0) + 1)));
    return m;
  });
  const df = new Map<string, number>();
  counts.forEach((m) => m.forEach((_v, p) => df.set(p, (df.get(p) ?? 0) + 1)));
  const used = new Set<string>();

  return counts.map((m) => {
    const ranked = [...m]
      .filter(([p, n]) => (p.includes(' ') ? n >= 2 : n >= 2 || m.size < 25))
      .map(([p, n]) => ({ p, score: n * (p.includes(' ') ? 2.2 : 1) * Math.log(1 + chunks.length / df.get(p)!) }))
      .sort((a, b) => b.score - a.score);

    const picks: string[] = [];
    for (const { p } of ranked) {
      if (used.has(p) || picks.some((q) => q.includes(p) || p.includes(q))) continue;
      picks.push(p);
      if (picks.length === 2) break;
    }
    picks.forEach((p) => used.add(p));
    if (!picks.length) return 'Discussion';
    return picks.length === 2 ? `${titleCase(picks[0])} and ${titleCase(picks[1]).toLowerCase()}` : titleCase(picks[0]);
  });
}

/**
 * Curated topics covering the demo content (mock transcripts + public/media/ml-01.json), so the demo shows
 * realistic titles. Anything not covered falls back to the key-phrase titles above.
 */
const TOPICS: { re: RegExp; title: string }[] = [
  // ml-01.json (feed-forward neural networks)
  { re: /perceptron|heav[ey]+ ?side|step function|sign function|threshold/g, title: 'From perceptrons to multilayer networks' },
  { re: /input layer|output layer|bias|output for convenience/g, title: 'Input and output layers' },
  { re: /hidden layers?|trial and error|design choice|magic rules|reasonable amount/g, title: 'How many hidden layers and neurons?' },
  { re: /fully connected|matrix of weights|parameters|number of weights|dense/g, title: 'Fully connected layers and parameter count' },
  { re: /skip connection|feed ?forward|flip forward|recurrent|one direction|feedback/g, title: 'Feed-forward networks and skip connections' },
  { re: /activation function|differentiable|derivative|relu|sigmoid/g, title: 'Why activation functions must be differentiable' },
  // Machine Learning intro (mock)
  { re: /welcome|definition|mitchell|experience e|three ingredients/g, title: 'What is machine learning?' },
  { re: /supervised|regression|classification|spam|clustering|forecasting/g, title: 'Supervised and unsupervised learning' },
  { re: /reinforcement|agent|reward/g, title: 'Reinforcement learning' },
  { re: /hypothesis|loss function|risk|empirical/g, title: 'Formalizing the learning problem' },
  { re: /generali[sz]ation|overfit|underfit|validation (set|error)/g, title: 'Generalization and overfitting' },
  { re: /exam|webeep|organization of the course|optional project/g, title: 'Course organization and exam' },
  // Machine Learning pool
  { re: /closed-form|invert|invertible/g, title: 'The closed-form solution' },
  { re: /regulari[sz]ation|penalty/g, title: 'Regularization' },
  { re: /bias|variance/g, title: 'The bias–variance trade-off' },
  { re: /cross-validation|validation error|regularization parameter/g, title: 'Model selection with cross-validation' },
  { re: /kernel|support vector|decision boundary/g, title: 'Kernels and support vectors' },
  { re: /previous lecture|recalling/g, title: 'Recap of the previous lecture' },
  // ANN pool
  { re: /weighted sum|feed-forward|stacking layers|neuron computes/g, title: 'Neurons and feed-forward networks' },
  { re: /backpropagation|chain rule|learning rate|gradient/g, title: 'Backpropagation and gradient descent' },
  { re: /relu|sigmoid|saturates|vanish/g, title: 'Activations and vanishing gradients' },
  { re: /convolution|pooling|weight sharing/g, title: 'Convolutions and pooling' },
  { re: /dropout|batch normalization|regularizer/g, title: 'Dropout and batch normalization' },
  { re: /recurrent|hidden state|attention/g, title: 'Sequences: RNNs and attention' },
  // Software Engineering 2 pool
  { re: /requirements?|domain assumptions?|goals|phenomena/g, title: 'Goals, requirements and domain assumptions' },
  { re: /alloy|signatures|counterexamples?|bounded scope/g, title: 'Formal modelling with Alloy' },
  { re: /architectur|client–server|connectors/g, title: 'Architectural styles' },
  { re: /testing|bugs|function points|estimate/g, title: 'Testing and effort estimation' },
  // Computer Security pool
  { re: /cia triad|confidentiality|threat model|attacker/g, title: 'The CIA triad and threat models' },
  { re: /encrypt|decrypt|public-key|cryptography|key distribution/g, title: 'Symmetric and public-key cryptography' },
  { re: /passwords?|multi-factor|second factor|phished/g, title: 'Authentication and MFA' },
  { re: /buffer overflow|canar|layout randomization|exploitation/g, title: 'Memory-safety exploits and mitigations' },
  { re: /cross-site scripting|browser/g, title: 'Web attacks: cross-site scripting' },
  // AAPP pool
  { re: /randomized|las vegas|monte carlo/g, title: 'Randomized algorithms' },
  { re: /amortized/g, title: 'Amortized analysis' },
  { re: /openmp|race conditions?|threads/g, title: 'Shared-memory parallelism with OpenMP' },
  { re: /\bmpi\b|exchanging messages|amdahl/g, title: "Message passing and Amdahl's law" },
];

const countMatches = (re: RegExp, text: string) => text.match(re)?.length ?? 0;

/** Assigns each chapter its best-matching curated topic (each topic used once), or undefined. */
function curatedTitles(chunks: TranscriptSegment[][]): (string | undefined)[] {
  const texts = chunks.map((c) => c.map((s) => s.text.toLowerCase()).join(' '));
  const pairs = texts
    .flatMap((t, ci) => TOPICS.map((topic, ti) => ({ ci, ti, score: countMatches(topic.re, t) })))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.ti - b.ti);
  const out: (string | undefined)[] = chunks.map(() => undefined);
  const usedTopics = new Set<number>();
  for (const p of pairs) {
    if (out[p.ci] || usedTopics.has(p.ti)) continue;
    out[p.ci] = TOPICS[p.ti].title;
    usedTopics.add(p.ti);
  }
  return out;
}

/** The sentence that best represents the chapter: most key phrases of its title, reasonable length. */
function summaryFor(segs: TranscriptSegment[], title: string): string | undefined {
  const topic = TOPICS.find((t) => t.title === title);
  const keys = new Set(phrases(title));
  let best: TranscriptSegment | undefined;
  let bestScore = -1;
  for (const s of segs) {
    const n = s.text.split(/\s+/).length;
    if (n < 7 || n > 40) continue;
    const lower = s.text.toLowerCase();
    const score = (topic ? countMatches(topic.re, lower) * 2 : 0) + phrases(s.text).filter((p) => keys.has(p)).length + (s.speaker === segs[0].speaker ? 0.2 : 0);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  const text = best?.text.trim();
  if (!text) return undefined;
  return /[.?!]$/.test(text) ? text : `${text}…`;
}

export function mockChapterDrafts(transcript: Transcript): ChapterDraft[] {
  const segs = transcript.segments;
  const cuts = planBoundaries(segs);
  const chunks = cuts.map((c, i) => segs.slice(c, cuts[i + 1] ?? segs.length));
  const curated = curatedTitles(chunks);
  const fallback = titlesFor(chunks);

  return chunks.map((chunk, i) => {
    const title = curated[i] ?? fallback[i];
    return { start: chunk[0].start, title, summary: summaryFor(chunk, title) };
  });
}
