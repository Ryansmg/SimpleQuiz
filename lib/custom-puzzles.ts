import "server-only";

import mysql, {
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import type { PuzzleDifficulty } from "@/lib/seventeen-expression";

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

type GlobalWithPuzzlePool = typeof globalThis & {
  seventeenPuzzlePool?: Pool;
  seventeenPuzzleSchema?: Promise<void>;
};

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

async function ensureSchema(): Promise<void> {
  if (!globalWithPuzzlePool.seventeenPuzzleSchema) {
    globalWithPuzzlePool.seventeenPuzzleSchema = getPool()
      .query(`
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
      `)
      .then(() => undefined)
      .catch((error) => {
        globalWithPuzzlePool.seventeenPuzzleSchema = undefined;
        throw error;
      });
  }

  await globalWithPuzzlePool.seventeenPuzzleSchema;
}

function parseCards(value: string | string[]): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every((card) => typeof card === "string")) {
    throw new Error("저장된 카드 데이터가 올바르지 않습니다.");
  }
  return parsed;
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
  const [result] = await getPool().execute<ResultSetHeader>(
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

  return String(result.insertId);
}