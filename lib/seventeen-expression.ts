export type PuzzleDifficulty = "입문" | "보통" | "도전";

export const PUZZLE_DIFFICULTIES: readonly PuzzleDifficulty[] = [
  "입문",
  "보통",
  "도전",
];

type Rational = {
  numerator: bigint;
  denominator: bigint;
};

type TokenType =
  | "number"
  | "plus"
  | "minus"
  | "multiply"
  | "divide"
  | "power"
  | "leftParen"
  | "rightParen"
  | "end";

type Token = {
  type: TokenType;
  text: string;
};

type Evaluation = {
  value: Rational;
  usedLiterals: string[];
};

export type ExpressionCheck =
  | { ok: true; value: "17"; usedLiterals: string[] }
  | {
      ok: false;
      kind: "input" | "syntax" | "cards" | "result";
      message: string;
      value?: string;
    };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const SEVENTEEN = BigInt(17);
const MAX_POWER_BITS = 200_000;

function absolute(value: bigint): bigint {
  return value < ZERO ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);

  while (b !== ZERO) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a || ONE;
}

function fraction(numerator: bigint, denominator = ONE): Rational {
  if (denominator === ZERO) {
    throw new Error("0으로 나눌 수는 없어요.");
  }

  const sign = denominator < ZERO ? -ONE : ONE;
  const divisor = gcd(numerator, denominator);

  return {
    numerator: (numerator / divisor) * sign,
    denominator: absolute(denominator / divisor),
  };
}

function add(left: Rational, right: Rational): Rational {
  const divisor = gcd(left.denominator, right.denominator);
  const leftScale = right.denominator / divisor;
  const rightScale = left.denominator / divisor;

  return fraction(
    left.numerator * leftScale + right.numerator * rightScale,
    left.denominator * leftScale,
  );
}

function subtract(left: Rational, right: Rational): Rational {
  return add(left, fraction(-right.numerator, right.denominator));
}

function multiply(left: Rational, right: Rational): Rational {
  const leftDivisor = gcd(left.numerator, right.denominator);
  const rightDivisor = gcd(right.numerator, left.denominator);

  return fraction(
    (left.numerator / leftDivisor) * (right.numerator / rightDivisor),
    (left.denominator / rightDivisor) * (right.denominator / leftDivisor),
  );
}

function divide(left: Rational, right: Rational): Rational {
  if (right.numerator === ZERO) {
    throw new Error("0으로 나눌 수는 없어요.");
  }

  return multiply(left, fraction(right.denominator, right.numerator));
}

function bitLength(value: bigint): number {
  const magnitude = absolute(value);
  return magnitude === ZERO ? 1 : magnitude.toString(2).length;
}

function comparePower(base: bigint, exponent: number, target: bigint): number {
  let result = ONE;
  let factor = base;
  let remaining = exponent;

  while (remaining > 0) {
    if (remaining % 2 === 1) {
      result *= factor;
      if (result > target) return 1;
    }

    remaining = Math.floor(remaining / 2);
    if (remaining > 0) {
      factor *= factor;
      if (factor > target) factor = target + ONE;
    }
  }

  return result === target ? 0 : -1;
}

function exactRoot(value: bigint, degreeValue: bigint): bigint | null {
  if (degreeValue <= ZERO) return null;
  if (degreeValue === ONE || value === ZERO || value === ONE) return value;

  const negative = value < ZERO;
  if (negative && degreeValue % TWO === ZERO) return null;

  const magnitude = absolute(value);
  const bits = bitLength(magnitude);

  if (degreeValue > BigInt(bits)) return null;

  const degree = Number(degreeValue);
  const upperBits = Math.ceil(bits / degree) + 1;
  let low = ONE;
  let high = ONE << BigInt(upperBits);

  while (low <= high) {
    const middle = (low + high) / TWO;
    const comparison = comparePower(middle, degree, magnitude);

    if (comparison === 0) return negative ? -middle : middle;
    if (comparison < 0) low = middle + ONE;
    else high = middle - ONE;
  }

  return null;
}

function powInteger(base: bigint, exponent: bigint): bigint {
  if (exponent === ZERO) return ONE;
  if (base === ZERO) return ZERO;
  if (base === ONE) return ONE;
  if (base === -ONE) return exponent % TWO === ZERO ? ONE : -ONE;

  const estimatedBits = BigInt(bitLength(base)) * exponent;
  if (estimatedBits > BigInt(MAX_POWER_BITS)) {
    throw new Error(
      "이 거듭제곱은 계산 규모가 너무 커요. 큰 숫자 자체는 가능하지만, 지나치게 큰 거듭제곱은 사용할 수 없어요.",
    );
  }

  let result = ONE;
  let factor = base;
  let remaining = exponent;

  while (remaining > ZERO) {
    if (remaining % TWO === ONE) result *= factor;
    remaining /= TWO;
    if (remaining > ZERO) factor *= factor;
  }

  return result;
}

function power(base: Rational, exponent: Rational): Rational {
  if (exponent.numerator === ZERO) return fraction(ONE);
  if (base.numerator === ZERO) {
    if (exponent.numerator < ZERO) {
      throw new Error("0을 음수 번 거듭제곱할 수는 없어요.");
    }
    return fraction(ZERO);
  }

  if (base.numerator === base.denominator) return fraction(ONE);
  if (base.numerator === -base.denominator) {
    if (exponent.denominator % TWO === ZERO) {
      throw new Error("결과가 실수가 아닌 거듭제곱은 사용할 수 없어요.");
    }
    return fraction(exponent.numerator % TWO === ZERO ? ONE : -ONE);
  }

  const rootedNumerator = exactRoot(base.numerator, exponent.denominator);
  const rootedDenominator = exactRoot(base.denominator, exponent.denominator);

  if (rootedNumerator === null || rootedDenominator === null) {
    throw new Error("정확한 정수나 분수로 계산되지 않는 거듭제곱이에요.");
  }

  const positiveExponent = absolute(exponent.numerator);
  const numerator = powInteger(rootedNumerator, positiveExponent);
  const denominator = powInteger(rootedDenominator, positiveExponent);

  return exponent.numerator < ZERO
    ? fraction(denominator, numerator)
    : fraction(numerator, denominator);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/\d/.test(character)) {
      let text = character;
      index += 1;

      while (index < source.length && /\d/.test(source[index])) {
        text += source[index];
        index += 1;
      }

      tokens.push({ type: "number", text });
      continue;
    }

    const operators: Record<string, TokenType> = {
      "+": "plus",
      "-": "minus",
      "−": "minus",
      "*": "multiply",
      "×": "multiply",
      x: "multiply",
      X: "multiply",
      "/": "divide",
      "÷": "divide",
      "^": "power",
      "(": "leftParen",
      ")": "rightParen",
    };
    const type = operators[character];

    if (!type) {
      throw new Error(`‘${character}’ 문자는 사용할 수 없어요.`);
    }

    tokens.push({ type, text: character });
    index += 1;
  }

  tokens.push({ type: "end", text: "" });
  return tokens;
}

class ExpressionParser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Evaluation {
    const result = this.parseAdditive();

    if (this.peek().type !== "end") {
      throw new Error("연산자나 괄호의 위치를 다시 확인해 주세요.");
    }

    return result;
  }

  private peek(): Token {
    return this.tokens[this.position];
  }

  private consume(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) throw new Error("식이 아직 완성되지 않았어요.");
    this.position += 1;
    return token;
  }

  private parseAdditive(): Evaluation {
    let left = this.parseMultiplicative();

    while (this.peek().type === "plus" || this.peek().type === "minus") {
      const operator = this.peek().type;
      this.position += 1;
      const right = this.parseMultiplicative();
      left = {
        value: operator === "plus" ? add(left.value, right.value) : subtract(left.value, right.value),
        usedLiterals: [...left.usedLiterals, ...right.usedLiterals],
      };
    }

    return left;
  }

  private parseMultiplicative(): Evaluation {
    let left = this.parsePower();

    while (this.peek().type === "multiply" || this.peek().type === "divide") {
      const operator = this.peek().type;
      this.position += 1;
      const right = this.parsePower();
      left = {
        value: operator === "multiply" ? multiply(left.value, right.value) : divide(left.value, right.value),
        usedLiterals: [...left.usedLiterals, ...right.usedLiterals],
      };
    }

    return left;
  }

  private parsePower(): Evaluation {
    const left = this.parseUnary();
    if (this.peek().type !== "power") return left;

    this.position += 1;
    const right = this.parsePower();

    return {
      value: power(left.value, right.value),
      usedLiterals: [...left.usedLiterals, ...right.usedLiterals],
    };
  }

  private parseUnary(): Evaluation {
    if (this.peek().type === "minus" || this.peek().type === "plus") {
      const negative = this.peek().type === "minus";
      this.position += 1;
      const result = this.parseUnary();
      return {
        value: negative
          ? fraction(-result.value.numerator, result.value.denominator)
          : result.value,
        usedLiterals: result.usedLiterals,
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Evaluation {
    const token = this.peek();

    if (token.type === "number") {
      this.position += 1;
      return {
        value: fraction(BigInt(token.text)),
        usedLiterals: [token.text],
      };
    }

    if (token.type === "leftParen") {
      this.position += 1;
      const result = this.parseAdditive();
      this.consume("rightParen");
      return result;
    }

    throw new Error(
      token.type === "end"
        ? "식이 아직 완성되지 않았어요."
        : "숫자나 괄호의 위치를 다시 확인해 주세요.",
    );
  }
}

function formatRational(value: Rational): string {
  return value.denominator === ONE
    ? value.numerator.toString()
    : `${value.numerator.toString()}/${value.denominator.toString()}`;
}

function findCardAllocation(
  cards: string[],
  literals: string[],
  requireEveryCard: boolean,
): number[] | null {
  const allCardsMask = (1 << cards.length) - 1;

  function search(
    literalIndex: number,
    position: number,
    usedMask: number,
    usedIndexes: number[],
  ): number[] | null {
    if (literalIndex >= literals.length) {
      return !requireEveryCard || usedMask === allCardsMask ? usedIndexes : null;
    }

    const literal = literals[literalIndex];
    if (position >= literal.length) {
      return search(literalIndex + 1, 0, usedMask, usedIndexes);
    }

    const candidates = cards
      .map((text, index) => ({ text, index }))
      .filter(
        ({ text, index }) =>
          (usedMask & (1 << index)) === 0 && literal.startsWith(text, position),
      )
      .sort((left, right) => right.text.length - left.text.length);

    for (const candidate of candidates) {
      const result = search(
        literalIndex,
        position + candidate.text.length,
        usedMask | (1 << candidate.index),
        [...usedIndexes, candidate.index],
      );
      if (result) return result;
    }

    return null;
  }

  return search(0, 0, 0, []);
}

export function normalizePuzzleCards(input: unknown): string[] {
  if (!Array.isArray(input) || input.length !== 4) {
    throw new Error("숫자 카드를 정확히 네 장 입력해 주세요.");
  }

  return input.map((card) => {
    if (typeof card !== "string" && typeof card !== "number") {
      throw new Error("카드는 0 이상의 정수만 입력할 수 있어요.");
    }

    const text = String(card).trim();
    if (!/^\d+$/.test(text)) {
      throw new Error("카드는 0 이상의 정수만 입력할 수 있어요.");
    }

    return BigInt(text).toString();
  });
}

export function checkSeventeenExpression(
  cardInput: unknown,
  source: string,
): ExpressionCheck {
  let cards: string[];

  try {
    cards = normalizePuzzleCards(cardInput);
  } catch (error) {
    return {
      ok: false,
      kind: "input",
      message: error instanceof Error ? error.message : "카드를 확인해 주세요.",
    };
  }

  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, kind: "input", message: "먼저 답안을 입력해 주세요." };
  }

  let evaluation: Evaluation;
  try {
    evaluation = new ExpressionParser(tokenize(source)).parse();
  } catch (error) {
    return {
      ok: false,
      kind: "syntax",
      message: error instanceof Error ? error.message : "식을 계산할 수 없어요.",
    };
  }

  if (!findCardAllocation(cards, evaluation.usedLiterals, true)) {
    const partial = findCardAllocation(cards, evaluation.usedLiterals, false);
    return {
      ok: false,
      kind: "cards",
      message: partial
        ? "네 장의 카드를 모두 정확히 한 번씩 사용해 주세요."
        : "카드에 없는 수를 썼거나 같은 카드를 두 번 사용했어요. 이어 붙이기는 원본 카드끼리만 가능합니다.",
    };
  }

  const value = formatRational(evaluation.value);
  if (
    evaluation.value.numerator !== SEVENTEEN ||
    evaluation.value.denominator !== ONE
  ) {
    return {
      ok: false,
      kind: "result",
      value,
      message: `계산 결과는 ${value}이에요. 17이 되도록 다시 만들어 보세요.`,
    };
  }

  return { ok: true, value: "17", usedLiterals: evaluation.usedLiterals };
}