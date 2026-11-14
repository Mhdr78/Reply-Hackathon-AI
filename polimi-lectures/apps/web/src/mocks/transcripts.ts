import type { Lecture, Transcript, TranscriptSegment, TranscriptWord } from '@/types/domain';

/** Lines prefixed with "S:" are spoken by a student (SPEAKER_01); others by the lecturer (SPEAKER_00). */
const ML_INTRO = [
  'Good morning everyone, and welcome to the first lecture of Machine Learning.',
  'Today we are going to introduce the fundamental concepts of machine learning.',
  'Machine learning allows computers to learn patterns from data, without being explicitly programmed for every single case.',
  'Let me start with a definition that is commonly attributed to Tom Mitchell.',
  'A program learns from experience E with respect to a task T and a performance measure P, if its performance on T, measured by P, improves with experience E.',
  'So we always have three ingredients: a task, some experience, which is our data, and a way to measure performance.',
  'There are several different approaches, including supervised and unsupervised learning.',
  'In supervised learning we are given input–output pairs, and the goal is to learn a function that maps inputs to outputs.',
  'If the output is a continuous value we talk about regression, and if it is a discrete label we talk about classification.',
  'For example, predicting the price of an apartment in Milan from its surface and its neighbourhood is a regression problem.',
  'Deciding whether an email is spam or not is a classification problem.',
  'S: Professor, is time series forecasting also supervised learning?',
  'Yes, good question. Forecasting is usually framed as supervised learning, where the past values are the inputs and the future value is the target.',
  'In unsupervised learning, instead, we only have the inputs, and we look for structure in the data.',
  'Clustering, dimensionality reduction and density estimation are typical unsupervised tasks.',
  'Then there is a third paradigm, reinforcement learning, where an agent interacts with an environment and receives rewards.',
  'We will dedicate the last part of the course to reinforcement learning.',
  'Now, let us formalize the supervised learning problem a little bit.',
  'We assume that there is an unknown function f that generates the targets, possibly corrupted by noise.',
  'We choose a hypothesis space H, which is the set of functions our model can represent.',
  'Learning means searching inside H for the hypothesis that best approximates f.',
  'To measure how good a hypothesis is, we define a loss function, for instance the squared error.',
  'The quantity we really care about is the expected loss on new, unseen data, which we call the true risk.',
  'Unfortunately we cannot compute it, because we do not know the data distribution.',
  'So we minimize the empirical risk, which is the average loss on the training set.',
  'And here comes the central problem of the whole course: generalization.',
  'A model that is too simple will underfit, it cannot capture the structure of the data.',
  'A model that is too complex will overfit, it memorizes the noise in the training set.',
  'This tension is known as the bias–variance trade-off, and we will study it in detail in lecture four.',
  'S: How do we know in practice if we are overfitting?',
  'We keep some data aside, a validation set, and we compare the training error with the validation error.',
  'If the training error is low but the validation error is high, that is the classic sign of overfitting.',
  'We will see more principled techniques, like cross-validation, later in the course.',
  'Let me now say a few words about the organization of the course.',
  'The exam consists of a written test and an optional project that can give you up to four additional points.',
  'All the material, including slides and these recordings, is available on WeBeep.',
  'For the next lecture, please review some basic linear algebra and probability, in particular expectations and variances.',
  'Next time we will start with linear regression and the method of least squares.',
  'That is all for today, thank you, and see you on Thursday.',
];

const POOLS: Record<string, string[]> = {
  ml: [
    'Let us start by recalling what we discussed in the previous lecture.',
    'Remember that our objective is always to minimize the expected loss on unseen data.',
    'The key idea here is to control the complexity of the hypothesis space.',
    'If we look at the closed-form solution, we see that it requires inverting a matrix.',
    'S: Does this still work when the number of features is larger than the number of samples?',
    'In that case the matrix is not invertible, and this is exactly where regularization helps.',
    'Adding a penalty term on the weights reduces the variance of the estimator.',
    'We trade a small increase in bias for a large reduction in variance.',
    'Cross-validation lets us choose the regularization parameter in a principled way.',
    'Notice how the validation error first decreases and then increases as the model becomes more complex.',
    'Kernels allow us to work in a high-dimensional feature space without ever computing it explicitly.',
    'The support vectors are the only training points that determine the decision boundary.',
    'We will see an implementation of this in the next exercise session.',
  ],
  ann: [
    'A neuron computes a weighted sum of its inputs followed by a non-linear activation.',
    'Stacking layers of neurons gives us a feed-forward network.',
    'Backpropagation is simply the chain rule applied efficiently to a computational graph.',
    'The learning rate controls how big a step we take along the negative gradient.',
    'S: Why do we prefer ReLU over the sigmoid in deep networks?',
    'Because the sigmoid saturates and its gradient vanishes, while ReLU keeps gradients alive for positive inputs.',
    'Convolutions exploit the spatial structure of images through weight sharing.',
    'Pooling layers make the representation more robust to small translations.',
    'Dropout randomly switches off neurons during training, which acts as a regularizer.',
    'Batch normalization stabilizes training by normalizing the activations of each layer.',
    'Recurrent networks maintain a hidden state that summarizes the sequence seen so far.',
    'Attention lets the model decide which parts of the input are relevant for each output.',
  ],
  se2: [
    'Requirements describe what the machine must do, at the interface with the world.',
    'Domain assumptions are properties of the world that we rely on but do not control.',
    'Goals are prescriptive statements about the world that stakeholders want to achieve.',
    'S: Can a requirement be expressed in terms of phenomena the machine cannot observe?',
    'No, requirements must only refer to shared phenomena, those visible to both the world and the machine.',
    'Alloy lets us describe structures with signatures, facts and predicates.',
    'The analyzer searches for counterexamples within a bounded scope.',
    'An architectural style constrains the components and connectors we can use.',
    'In a client–server architecture the server exposes services consumed by many clients.',
    'Testing can show the presence of bugs, but never their absence.',
    'Function points are one way to estimate the size of a software project.',
  ],
  sec: [
    'Security is about confidentiality, integrity and availability, the so-called CIA triad.',
    'A threat model describes who the attacker is and what they are able to do.',
    'Symmetric encryption uses the same key to encrypt and decrypt.',
    'Public-key cryptography solves the key distribution problem.',
    'S: Why are passwords alone not considered sufficient anymore?',
    'Because they can be phished, guessed or leaked, which is why we add a second factor.',
    'Multi-factor authentication combines something you know, something you have and something you are.',
    'A buffer overflow happens when a program writes past the end of a buffer.',
    'Stack canaries and address space layout randomization make exploitation harder.',
    'Cross-site scripting allows an attacker to run scripts in the victim\'s browser.',
  ],
  aapp: [
    'A randomized algorithm makes random choices during its execution.',
    'Las Vegas algorithms are always correct, while Monte Carlo algorithms may return a wrong answer with small probability.',
    'Amortized analysis bounds the average cost of an operation over a worst-case sequence.',
    'S: Is amortized cost the same as average-case cost?',
    'No, amortized analysis gives a worst-case guarantee on the whole sequence, without any probabilistic assumption.',
    'OpenMP lets us parallelize loops with simple compiler directives.',
    'Race conditions appear when threads access shared data without synchronization.',
    'In MPI, processes communicate exclusively by exchanging messages.',
    'Amdahl\'s law tells us that the sequential part limits the achievable speed-up.',
  ],
};

function wordsFor(text: string, start: number, end: number): TranscriptWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const totalChars = tokens.reduce((n, t) => n + t.length + 1, 0);
  let t = start;
  return tokens.map((word) => {
    const d = ((word.length + 1) / totalChars) * (end - start);
    const w = { word, start: +t.toFixed(2), end: +(t + d - 0.02).toFixed(2), score: 0.9 };
    t += d;
    return w;
  });
}

function buildSegments(lines: string[]): TranscriptSegment[] {
  let t = 0.52;
  return lines.map((raw, id) => {
    const student = raw.startsWith('S: ');
    const text = student ? raw.slice(3) : raw;
    const dur = Math.max(2.2, text.split(/\s+/).length * 0.36);
    const start = +t.toFixed(2);
    const end = +(t + dur).toFixed(2);
    t = end + 0.3 + ((id * 37) % 5) / 10;
    return { id, start, end, text, speaker: student ? 'SPEAKER_01' : 'SPEAKER_00', words: wordsFor(text, start, end) };
  });
}

export function buildMockTranscript(lecture: Lecture): Transcript {
  let lines: string[];
  if (lecture.id === 'ml-01') {
    lines = ML_INTRO;
  } else {
    const pool = POOLS[lecture.courseId] ?? POOLS.ml;
    const rotated = [...pool.slice(lecture.number % pool.length), ...pool.slice(0, lecture.number % pool.length)];
    lines = [
      `Good morning, today's lecture is about ${lecture.title.toLowerCase()}.`,
      ...rotated,
      'That is all for today. Please go through the slides before the next lecture.',
    ];
  }
  return {
    lectureId: lecture.id,
    language: 'en',
    engine: 'mock-whisperx',
    createdAt: new Date().toISOString(),
    speakers: { SPEAKER_00: 'Lecturer', SPEAKER_01: 'Student' },
    segments: buildSegments(lines),
  };
}
