export type NumberMode = "single" | "large";

export type GeneratedChallenge = {
  key: string;
  cards: number[];
  difficulty: "입문" | "보통" | "도전";
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
  cost: number;
  rawCards: boolean;
  usedJoin: boolean;
  usedDivision: boolean;
  usedPower: boolean;
};

const TARGET = 17;
const MAX_ABS_VALUE = 1_000_000;
const MAX_ATTEMPTS = 300;

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

function power(base: Fraction, exponent: number): Fraction | null {
  if (exponent < 0 && base.numerator === 0) {
    return null;
  }

  const positiveExponent = Math.abs(exponent);
  const numerator = base.numerator ** positiveExponent;
  const denominator = base.denominator ** positiveExponent;

  return exponent < 0
    ? fraction(denominator, numerator)
    : fraction(numerator, denominator);
}

function valueKey(state: SolverState): string {
  return `${state.value.numerator}/${state.value.denominator}|${
    state.rawCards ? "raw" : "calculated"
  }`;
}

function stateScore(state: SolverState): number {
  return state.cost * 30 + state.expression.length;
}

function addState(states: Map<string, SolverState>, state: SolverState | null) {
  if (!state) {
    return;
  }

  const key = valueKey(state);
  const current = states.get(key);

  if (!current || stateScore(state) < stateScore(current)) {
    states.set(key, state);
  }
}

function wrapped(state: SolverState): string {
  return state.rawCards ? state.expression : `(${state.expression})`;
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

  return {
    value,
    expression: `${wrapped(left)} ${symbol} ${wrapped(right)}`,
    cost: left.cost + right.cost + 1,
    rawCards: false,
    usedJoin: left.usedJoin || right.usedJoin || Boolean(flags?.usedJoin),
    usedDivision:
      left.usedDivision ||
      right.usedDivision ||
      Boolean(flags?.usedDivision),
    usedPower: left.usedPower || right.usedPower || Boolean(flags?.usedPower),
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
    cost: left.cost + right.cost + 1,
    rawCards: true,
    usedJoin: true,
    usedDivision: false,
    usedPower: false,
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

    if (
      exponent.denominator === 1 &&
      exponent.numerator >= -4 &&
      exponent.numerator <= 5 &&
      exponent.numerator !== 0 &&
      exponent.numerator !== 1
    ) {
      candidates.push(
        binaryState(
          base,
          exponentState,
          power(base.value, exponent.numerator),
          "^",
          { usedPower: true },
        ),
      );
    }
  }

  candidates.forEach((candidate) => addState(target, candidate));
}

export function solveCards(cards: number[]): SolverState | null {
  const subsetCount = 1 << cards.length;
  const states = Array.from(
    { length: subsetCount },
    () => new Map<string, SolverState>(),
  );

  cards.forEach((card, index) => {
    addState(states[1 << index], {
      value: { numerator: card, denominator: 1 },
      expression: String(card),
      cost: 0,
      rawCards: true,
      usedJoin: false,
      usedDivision: false,
      usedPower: false,
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
    .sort((left, right) => stateScore(left) - stateScore(right));

  return solutions[0] ?? null;
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

function describeSolution(solution: SolverState): Pick<
  GeneratedChallenge,
  "difficulty" | "hint"
> {
  if (solution.usedPower) {
    return {
      difficulty: "도전",
      hint: "거듭제곱을 쓰면 17에 가까운 수를 만들 수 있어요.",
    };
  }

  if (solution.usedJoin && solution.usedDivision) {
    return {
      difficulty: "도전",
      hint: "원본 카드 두 장을 붙이고, 나눗셈도 함께 사용해 보세요.",
    };
  }

  if (solution.usedJoin) {
    return {
      difficulty: "보통",
      hint: "계산하기 전에 원본 카드 두 장을 붙여 보세요.",
    };
  }

  if (solution.usedDivision) {
    return {
      difficulty: "보통",
      hint: "나눗셈으로 작은 차이를 만드는 방법을 찾아보세요.",
    };
  }

  return {
    difficulty: "입문",
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
): GeneratedChallenge {
  const recent = new Set(recentKeys);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const cards = shuffle(createRandomCards(mode));
    const key = challengeKey(cards);

    if (recent.has(key)) {
      continue;
    }

    const solution = solveCards(cards);

    if (solution) {
      return {
        key,
        cards,
        solution: solution.expression,
        ...describeSolution(solution),
      };
    }
  }

  const cards = shuffle(FALLBACKS[mode]);
  const solution = solveCards(cards);

  if (!solution) {
    throw new Error("기본 퍼즐을 생성하지 못했습니다.");
  }

  return {
    key: challengeKey(cards),
    cards,
    solution: solution.expression,
    ...describeSolution(solution),
  };
}
