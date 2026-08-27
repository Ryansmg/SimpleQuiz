export type NumberMode = "single" | "large";
export type Difficulty = "입문" | "보통" | "도전";
export type DifficultyPreference = "mixed" | Difficulty;

export type CardRating = {
  difficulty: Difficulty;
  score: number;
  solutionCount: number;
  solution: string;
};

export type GeneratedChallenge = {
  key: string;
  cards: number[];
  difficulty: Difficulty;
  hint: string;
  solution: string;
};

type Fraction = {
  numerator: number;
  denominator: number;
};

type SolverState = {
  value: Fraction;
  expression: string;
  signature: string;
  rawCards: boolean;
  rootOperator: "+" | "×" | null;
  associativeParts: string[] | null;
  usedJoin: boolean;
  usedDivision: boolean;
  usedPower: boolean;
  operatorMask: number;
  complexity: number;
  depth: number;
};

type SolutionAnalysis = {
  solutions: SolverState[];
  easiest: SolverState;
  difficulty: GeneratedChallenge["difficulty"];
  difficultyScore: number;
};

const TARGET = 17;
const MAX_ABS_VALUE = 1_000_000;
const MAX_ATTEMPTS = 300;
const OPERATOR_BITS: Record<string, number> = {
  "+": 1 << 0,
  "−": 1 << 1,
  "×": 1 << 2,
  "÷": 1 << 3,
  "^": 1 << 4,
  join: 1 << 5,
};

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a || 1;
}

function fraction(
  numerator: number,
  denominator = 1,
): Fraction | null {
  if (
    denominator === 0 ||
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator)
  ) {
    return null;
  }

  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  const normalized = {
    numerator: (numerator / divisor) * sign,
    denominator: Math.abs(denominator / divisor),
  };

  if (
    Math.abs(normalized.numerator) >
    MAX_ABS_VALUE * normalized.denominator
  ) {
    return null;
  }

  return normalized;
}

function add(left: Fraction, right: Fraction): Fraction | null {
  return fraction(
    left.numerator * right.denominator +
      right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: Fraction, right: Fraction): Fraction | null {
  return fraction(
    left.numerator * right.denominator -
      right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Fraction, right: Fraction): Fraction | null {
  return fraction(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function divide(left: Fraction, right: Fraction): Fraction | null {
  if (right.numerator === 0) {
    return null;
  }

  return fraction(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function exactRoot(value: number, degree: number): number | null {
  if (degree <= 0 || (value < 0 && degree % 2 === 0)) {
    return null;
  }

  const candidate = Math.round(Math.abs(value) ** (1 / degree));
  const signedCandidate = value < 0 ? -candidate : candidate;

  return signedCandidate ** degree === value ? signedCandidate : null;
}

function power(base: Fraction, exponent: Fraction): Fraction | null {
  if (exponent.numerator < 0 && base.numerator === 0) {
    return null;
  }

  const rootedNumerator = exactRoot(base.numerator, exponent.denominator);
  const rootedDenominator = exactRoot(
    base.denominator,
    exponent.denominator,
  );

  if (rootedNumerator === null || rootedDenominator === null) {
    return null;
  }

  const positiveExponent = Math.abs(exponent.numerator);
  const numerator = rootedNumerator ** positiveExponent;
  const denominator = rootedDenominator ** positiveExponent;

  return exponent.numerator < 0
    ? fraction(denominator, numerator)
    : fraction(numerator, denominator);
}

function addState(states: Map<string, SolverState>, state: SolverState | null) {
  if (!state) {
    return;
  }

  const current = states.get(state.signature);

  if (
    !current ||
    state.complexity < current.complexity ||
    (state.complexity === current.complexity &&
      state.expression.length < current.expression.length)
  ) {
    states.set(state.signature, state);
  }
}

function wrapped(state: SolverState): string {
  return state.rawCards ? state.expression : `(${state.expression})`;
}

function binarySignature(
  left: SolverState,
  right: SolverState,
  symbol: string,
): Pick<SolverState, "signature" | "rootOperator" | "associativeParts"> {
  if (symbol === "+" || symbol === "×") {
    const parts = [
      ...(left.rootOperator === symbol && left.associativeParts
        ? left.associativeParts
        : [left.signature]),
      ...(right.rootOperator === symbol && right.associativeParts
        ? right.associativeParts
        : [right.signature]),
    ].sort();

    return {
      signature: `${symbol}(${parts.join(",")})`,
      rootOperator: symbol,
      associativeParts: parts,
    };
  }

  return {
    signature: `${symbol}(${left.signature},${right.signature})`,
    rootOperator: null,
    associativeParts: null,
  };
}

function operationComplexity(
  symbol: string,
  left: SolverState,
  right: SolverState,
  result?: Fraction,
): number {
  if (symbol === "+") return 1;
  if (symbol === "−") return 1.2;
  if (symbol === "×") return 1.25;
  if (symbol === "÷") return result?.denominator === 1 ? 1.3 : 1.8;

  if (symbol === "^") {
    const exponent = right.value.numerator;
    return 2.8 + (Math.abs(exponent) >= 3 ? 0.45 : 0) + (exponent < 0 ? 0.75 : 0);
  }

  const joinedLength = left.expression.length + right.expression.length;
  return 1.65 + Math.max(0, joinedLength - 1) * 0.45;
}

function countBits(value: number): number {
  let remaining = value;
  let count = 0;

  while (remaining > 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }

  return count;
}

function solutionComplexity(state: SolverState): number {
  const operatorVariety = countBits(state.operatorMask);
  return state.complexity + Math.max(0, operatorVariety - 1) * 0.35;
}

function resultComplexity(value: Fraction): number {
  const absoluteValue = Math.abs(value.numerator / value.denominator);
  let score = 0;

  if (value.denominator !== 1) score += 1.25;
  if (value.numerator < 0) score += 0.55;
  if (absoluteValue > 1_000) score += 0.75;
  else if (absoluteValue > 100) score += 0.4;
  else if (absoluteValue > 50) score += 0.15;

  return score;
}

function targetCompositionBonus(
  symbol: string,
  left: SolverState,
  right: SolverState,
  result: Fraction,
): number {
  if (result.numerator !== TARGET || result.denominator !== 1) {
    return 0;
  }

  const leftValue = Math.abs(left.value.numerator / left.value.denominator);
  const rightValue = Math.abs(right.value.numerator / right.value.denominator);

  if ((symbol === "+" || symbol === "−") && Math.min(leftValue, rightValue) <= 2) {
    return 0.75;
  }

  if ((symbol === "×" || symbol === "÷") && Math.min(leftValue, rightValue) === 1) {
    return 0.9;
  }

  return 0;
}

function binaryState(
  left: SolverState,
  right: SolverState,
  value: Fraction | null,
  symbol: string,
  flags?: Partial<
    Pick<SolverState, "usedJoin" | "usedDivision" | "usedPower">
  >,
): SolverState | null {
  if (!value) {
    return null;
  }

  const depth = Math.max(left.depth, right.depth) + 1;

  return {
    value,
    expression: `${wrapped(left)} ${symbol} ${wrapped(right)}`,
    ...binarySignature(left, right, symbol),
    rawCards: false,
    usedJoin: left.usedJoin || right.usedJoin || Boolean(flags?.usedJoin),
    usedDivision:
      left.usedDivision ||
      right.usedDivision ||
      Boolean(flags?.usedDivision),
    usedPower: left.usedPower || right.usedPower || Boolean(flags?.usedPower),
    operatorMask:
      left.operatorMask | right.operatorMask | (OPERATOR_BITS[symbol] ?? 0),
    complexity:
      left.complexity +
      right.complexity +
      operationComplexity(symbol, left, right, value) +
      resultComplexity(value) +
      Math.max(0, depth - 2) * 0.15 -
      targetCompositionBonus(symbol, left, right, value),
    depth,
  };
}

function joinedState(
  left: SolverState,
  right: SolverState,
): SolverState | null {
  if (!left.rawCards || !right.rawCards) {
    return null;
  }

  const expression = `${left.expression}${right.expression}`;
  const value = Number(expression);

  if (!Number.isSafeInteger(value) || value > MAX_ABS_VALUE) {
    return null;
  }

  return {
    value: { numerator: value, denominator: 1 },
    expression,
    signature: `join:${expression}`,
    rawCards: true,
    rootOperator: null,
    associativeParts: null,
    usedJoin: true,
    usedDivision: false,
    usedPower: false,
    operatorMask:
      left.operatorMask | right.operatorMask | OPERATOR_BITS.join,
    complexity:
      left.complexity +
      right.complexity +
      operationComplexity("join", left, right, {
        numerator: value,
        denominator: 1,
      }) +
      resultComplexity({ numerator: value, denominator: 1 }) -
      (Math.abs(value - TARGET) <= 1 ? 0.45 : 0),
    depth: Math.max(left.depth, right.depth) + 1,
  };
}

function combine(
  target: Map<string, SolverState>,
  left: SolverState,
  right: SolverState,
) {
  const candidates: Array<SolverState | null> = [
    binaryState(left, right, add(left.value, right.value), "+"),
    binaryState(left, right, multiply(left.value, right.value), "×"),
    binaryState(left, right, subtract(left.value, right.value), "−"),
    binaryState(right, left, subtract(right.value, left.value), "−"),
    binaryState(left, right, divide(left.value, right.value), "÷", {
      usedDivision: true,
    }),
    binaryState(right, left, divide(right.value, left.value), "÷", {
      usedDivision: true,
    }),
    joinedState(left, right),
    joinedState(right, left),
  ];

  const orderedPairs: Array<[SolverState, SolverState]> = [
    [left, right],
    [right, left],
  ];

  for (const [base, exponentState] of orderedPairs) {
    const exponent = exponentState.value;

    if (exponent.denominator > 0) {
      candidates.push(
        binaryState(
          base,
          exponentState,
          power(base.value, exponent),
          "^",
          { usedPower: true },
        ),
      );
    }
  }

  candidates.forEach((candidate) => addState(target, candidate));
}

function findSolutions(cards: number[]): SolverState[] {
  const subsetCount = 1 << cards.length;
  const states = Array.from(
    { length: subsetCount },
    () => new Map<string, SolverState>(),
  );

  cards.forEach((card, index) => {
    addState(states[1 << index], {
      value: { numerator: card, denominator: 1 },
      expression: String(card),
      signature: `card:${card}`,
      rawCards: true,
      rootOperator: null,
      associativeParts: null,
      usedJoin: false,
      usedDivision: false,
      usedPower: false,
      operatorMask: 0,
      complexity: 0,
      depth: 0,
    });
  });

  for (let subset = 1; subset < subsetCount; subset += 1) {
    if ((subset & (subset - 1)) === 0) {
      continue;
    }

    for (
      let leftSubset = (subset - 1) & subset;
      leftSubset > 0;
      leftSubset = (leftSubset - 1) & subset
    ) {
      const rightSubset = subset ^ leftSubset;

      if (rightSubset === 0 || leftSubset > rightSubset) {
        continue;
      }

      for (const left of states[leftSubset].values()) {
        for (const right of states[rightSubset].values()) {
          combine(states[subset], left, right);
        }
      }
    }
  }

  const solutions = [...states[subsetCount - 1].values()]
    .filter(
      (state) =>
        state.value.numerator === TARGET &&
        state.value.denominator === 1,
    )
    .sort(
      (left, right) =>
        solutionComplexity(left) - solutionComplexity(right) ||
        left.expression.length - right.expression.length,
    );

  return solutions;
}

function analyzeSolutions(solutions: SolverState[]): SolutionAnalysis | null {
  const easiest = solutions[0];

  if (!easiest) {
    return null;
  }

  // 모든 해를 보되, 가장 쉬운 해에서 멀어질수록 발견 가능성에 주는
  // 영향은 작게 본다. 어려운 변형식 수백 개가 난이도를 억지로 낮추는
  // 것을 막으면서도 쉬운 풀이가 여러 개인 문제는 확실히 낮게 평가한다.
  const easiestComplexity = solutionComplexity(easiest);
  const effectiveSolutionCount = solutions.reduce(
    (count, solution) =>
      count +
      2 ** (-(solutionComplexity(solution) - easiestComplexity) / 1.25),
    0,
  );
  const solutionBonus = Math.min(
    1.5,
    Math.log2(effectiveSolutionCount) * 0.5,
  );
  const difficultyScore = Math.max(
    0,
    easiestComplexity - solutionBonus,
  );
  const difficulty: GeneratedChallenge["difficulty"] =
    difficultyScore <= 3.7
      ? "입문"
      : difficultyScore <= 4.75
        ? "보통"
        : "도전";

  return {
    solutions,
    easiest,
    difficulty,
    difficultyScore,
  };
}

function analyzeCards(cards: number[]): SolutionAnalysis | null {
  return analyzeSolutions(findSolutions(cards));
}

export function rateCards(cards: number[]): CardRating | null {
  const analysis = analyzeCards(cards);

  if (!analysis) {
    return null;
  }

  return {
    difficulty: analysis.difficulty,
    score: analysis.difficultyScore,
    solutionCount: analysis.solutions.length,
    solution: analysis.easiest.expression,
  };
}

export function solveCards(cards: number[]): SolverState | null {
  return analyzeCards(cards)?.easiest ?? null;
}

function randomInt(minimum: number, maximum: number): number {
  const range = maximum - minimum + 1;

  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return minimum + (values[0] % range);
  }

  return minimum + Math.floor(Math.random() * range);
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index],
    ];
  }

  return result;
}

function createRandomCards(mode: NumberMode): number[] {
  if (mode === "single") {
    return Array.from({ length: 4 }, () => randomInt(0, 9));
  }

  const cards = Array.from({ length: 4 }, () =>
    randomInt(0, 99) < 55 ? randomInt(0, 9) : randomInt(10, 30),
  );

  if (!cards.some((card) => card >= 10)) {
    cards[randomInt(0, cards.length - 1)] = randomInt(10, 30);
  }

  return cards;
}

function challengeKey(cards: number[]): string {
  return [...cards].sort((left, right) => left - right).join(",");
}

function difficultyDistance(
  left: GeneratedChallenge["difficulty"],
  right: GeneratedChallenge["difficulty"],
): number {
  const order: Record<GeneratedChallenge["difficulty"], number> = {
    입문: 0,
    보통: 1,
    도전: 2,
  };

  return Math.abs(order[left] - order[right]);
}

function describeSolution(analysis: SolutionAnalysis): Pick<
  GeneratedChallenge,
  "difficulty" | "hint"
> {
  const solution = analysis.easiest;

  if (solution.usedPower) {
    return {
      difficulty: analysis.difficulty,
      hint: "거듭제곱을 쓰면 17에 가까운 수를 만들 수 있어요.",
    };
  }

  if (solution.usedJoin && solution.usedDivision) {
    return {
      difficulty: analysis.difficulty,
      hint: "원본 카드 두 장을 붙이고, 나눗셈도 함께 사용해 보세요.",
    };
  }

  if (solution.usedJoin) {
    return {
      difficulty: analysis.difficulty,
      hint: "계산하기 전에 원본 카드 두 장을 붙여 보세요.",
    };
  }

  if (solution.usedDivision) {
    return {
      difficulty: analysis.difficulty,
      hint: "나눗셈으로 작은 차이를 만드는 방법을 찾아보세요.",
    };
  }

  return {
    difficulty: analysis.difficulty,
    hint: "17에 가까운 수를 먼저 만든 뒤 남은 카드를 정리해 보세요.",
  };
}

const FALLBACKS: Record<NumberMode, number[]> = {
  single: [1, 1, 1, 7],
  large: [20, 6, 2, 1],
};

export function generateChallenge(
  mode: NumberMode,
  recentKeys: string[] = [],
  requestedDifficulty?: Difficulty,
): GeneratedChallenge {
  const recent = new Set(recentKeys);
  let closestChallenge: GeneratedChallenge | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const cards = shuffle(createRandomCards(mode));
    const key = challengeKey(cards);

    if (recent.has(key)) {
      continue;
    }

    const analysis = analyzeCards(cards);

    if (analysis) {
      const challenge = {
        key,
        cards,
        solution: analysis.easiest.expression,
        ...describeSolution(analysis),
      };

      if (
        !requestedDifficulty ||
        challenge.difficulty === requestedDifficulty
      ) {
        return challenge;
      }

      if (
        !closestChallenge ||
        difficultyDistance(challenge.difficulty, requestedDifficulty) <
          difficultyDistance(closestChallenge.difficulty, requestedDifficulty)
      ) {
        closestChallenge = challenge;
      }
    }
  }

  if (closestChallenge) {
    return closestChallenge;
  }

  const cards = shuffle(FALLBACKS[mode]);
  const analysis = analyzeCards(cards);

  if (!analysis) {
    throw new Error("기본 퍼즐을 생성하지 못했습니다.");
  }

  return {
    key: challengeKey(cards),
    cards,
    solution: analysis.easiest.expression,
    ...describeSolution(analysis),
  };
}
