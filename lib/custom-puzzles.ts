import "server-only";

import { createHash } from "node:crypto";
import mysql, {
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import {
  createPuzzleCardSignature,
  type PuzzleDifficulty,
} from "@/lib/seventeen-expression";

export type CustomPuzzle = {
  id: string;
  nickname: string;
  difficulty: PuzzleDifficulty;
  cards: string[];
  createdAt: Date | string;
};

type CustomPuzzleRow = RowDataPacket & {
  id: string | number;
  nickname: string;
  difficulty: PuzzleDifficulty;
  cards: string | string[];
  created_at: Date | string;
};

type PuzzleKeySeedRow = RowDataPacket & {
  id: string | number;
  cards: string | string[];
};

type MySqlError = {
  code?: string;
};

type GlobalWithPuzzlePool = typeof globalThis & {
  seventeenPuzzlePool?: Pool;
  seventeenPuzzleSchema?: Promise<void>;
};

export class DuplicateCustomPuzzleError extends Error {
  constructor() {
    super("이미 같은 숫자 카드로 등록된 문제가 있어요.");
    this.name = "DuplicateCustomPuzzleError";
  }
}

const globalWithPuzzlePool = globalThis as GlobalWithPuzzlePool;

function getPool(): Pool {
  const mysqlUrl = process.env.MYSQL_URL;
  if (!mysqlUrl) {
    throw new Error("MYSQL_URL 환경 변수가 설정되지 않았습니다.");
  }

  if (!globalWithPuzzlePool.seventeenPuzzlePool) {
    globalWithPuzzlePool.seventeenPuzzlePool = mysql.createPool({
      uri: mysqlUrl,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 5_000,
      maxIdle: 5,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      charset: "utf8mb4",
    });
  }

  return globalWithPuzzlePool.seventeenPuzzlePool;
}

function parseCards(value: string | string[]): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every((card) => typeof card === "string")) {
    throw new Error("저장된 카드 데이터가 올바르지 않습니다.");
  }
  return parsed;
}

function createCardKey(cards: string[]): string {
  return createHash("sha256")
    .update(createPuzzleCardSignature(cards))
    .digest("hex");
}

async function ensureSchema(): Promise<void> {
  if (!globalWithPuzzlePool.seventeenPuzzleSchema) {
    globalWithPuzzlePool.seventeenPuzzleSchema = (async () => {
      const pool = getPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS seventeen_custom_puzzles (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          nickname VARCHAR(20) NOT NULL,
          difficulty VARCHAR(10) NOT NULL,
          cards JSON NOT NULL,
          solution LONGTEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX seventeen_custom_created_at (created_at)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS seventeen_custom_puzzle_keys (
          card_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          puzzle_id BIGINT UNSIGNED NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (card_key),
          UNIQUE INDEX seventeen_custom_key_puzzle (puzzle_id)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      const [existingPuzzles] = await pool.query<PuzzleKeySeedRow[]>(`
        SELECT id, cards
        FROM seventeen_custom_puzzles
        ORDER BY id ASC
      `);

      for (const puzzle of existingPuzzles) {
        const cards = parseCards(puzzle.cards);
        await pool.execute(
          `
            INSERT IGNORE INTO seventeen_custom_puzzle_keys (card_key, puzzle_id)
            VALUES (?, ?)
          `,
          [createCardKey(cards), String(puzzle.id)],
        );
      }
    })().catch((error) => {
      globalWithPuzzlePool.seventeenPuzzleSchema = undefined;
      throw error;
    });
  }

  await globalWithPuzzlePool.seventeenPuzzleSchema;
}

function mapPuzzle(row: CustomPuzzleRow): CustomPuzzle {
  return {
    id: String(row.id),
    nickname: row.nickname,
    difficulty: row.difficulty,
    cards: parseCards(row.cards),
    createdAt: row.created_at,
  };
}

export async function listCustomPuzzles(): Promise<CustomPuzzle[]> {
  await ensureSchema();
  const [rows] = await getPool().query<CustomPuzzleRow[]>(`
    SELECT id, nickname, difficulty, cards, created_at
    FROM seventeen_custom_puzzles
    ORDER BY id DESC
    LIMIT 60
  `);

  return rows.map(mapPuzzle);
}

export async function getCustomPuzzle(id: string): Promise<CustomPuzzle | null> {
  if (!/^\d+$/.test(id)) return null;

  await ensureSchema();
  const [rows] = await getPool().execute<CustomPuzzleRow[]>(
    `
      SELECT id, nickname, difficulty, cards, created_at
      FROM seventeen_custom_puzzles
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  return rows[0] ? mapPuzzle(rows[0]) : null;
}

export async function createCustomPuzzle(input: {
  nickname: string;
  difficulty: PuzzleDifficulty;
  cards: string[];
  solution: string;
}): Promise<string> {
  await ensureSchema();
  const cardKey = createCardKey(input.cards);
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    try {
      await connection.execute(
        `
          INSERT INTO seventeen_custom_puzzle_keys (card_key)
          VALUES (?)
        `,
        [cardKey],
      );
    } catch (error) {
      if ((error as MySqlError).code === "ER_DUP_ENTRY") {
        throw new DuplicateCustomPuzzleError();
      }
      throw error;
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO seventeen_custom_puzzles (nickname, difficulty, cards, solution)
        VALUES (?, ?, ?, ?)
      `,
      [
        input.nickname,
        input.difficulty,
        JSON.stringify(input.cards),
        input.solution,
      ],
    );
    const puzzleId = String(result.insertId);

    await connection.execute(
      `
        UPDATE seventeen_custom_puzzle_keys
        SET puzzle_id = ?
        WHERE card_key = ?
      `,
      [puzzleId, cardKey],
    );

    await connection.commit();
    return puzzleId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}