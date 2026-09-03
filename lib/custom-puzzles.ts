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
  voteScore: number;
};

export type CustomPuzzleListOptions = {
  difficulty?: PuzzleDifficulty;
  sort?: "new" | "top";
};

type CustomPuzzleRow = RowDataPacket & {
  id: string | number;
  nickname: string;
  difficulty: PuzzleDifficulty;
  cards: string | string[];
  created_at: Date | string;
  vote_score: string | number | null;
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
  seventeenPuzzleSchemaVersion?: number;
};

export class DuplicateCustomPuzzleError extends Error {
  constructor() {
    super("이미 같은 숫자 카드로 등록된 문제가 있어요.");
    this.name = "DuplicateCustomPuzzleError";
  }
}

const SCHEMA_VERSION = 2;
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

export function createCustomPuzzleVoterKey(voterId: string): string {
  return createHash("sha256").update(voterId).digest("hex");
}

async function ensureSchema(): Promise<void> {
  if (
    !globalWithPuzzlePool.seventeenPuzzleSchema ||
    globalWithPuzzlePool.seventeenPuzzleSchemaVersion !== SCHEMA_VERSION
  ) {
    globalWithPuzzlePool.seventeenPuzzleSchemaVersion = SCHEMA_VERSION;
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

      await pool.query(`
        CREATE TABLE IF NOT EXISTS seventeen_custom_puzzle_votes (
          puzzle_id BIGINT UNSIGNED NOT NULL,
          voter_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          vote_value TINYINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (puzzle_id, voter_key),
          INDEX seventeen_custom_vote_score (puzzle_id, vote_value),
          CONSTRAINT seventeen_custom_vote_puzzle
            FOREIGN KEY (puzzle_id) REFERENCES seventeen_custom_puzzles(id)
            ON DELETE CASCADE
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
      globalWithPuzzlePool.seventeenPuzzleSchemaVersion = undefined;
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
    voteScore: Number(row.vote_score ?? 0),
  };
}

export async function listCustomPuzzles(
  options: CustomPuzzleListOptions = {},
): Promise<CustomPuzzle[]> {
  await ensureSchema();
  const values: string[] = [];
  const where = options.difficulty ? "WHERE p.difficulty = ?" : "";
  if (options.difficulty) values.push(options.difficulty);
  const order =
    options.sort === "top"
      ? "vote_score DESC, p.id DESC"
      : "p.id DESC";
  const [rows] = await getPool().execute<CustomPuzzleRow[]>(
    `
      SELECT
        p.id,
        p.nickname,
        p.difficulty,
        p.cards,
        p.created_at,
        COALESCE(v.vote_score, 0) AS vote_score
      FROM seventeen_custom_puzzles p
      LEFT JOIN (
        SELECT puzzle_id, SUM(vote_value) AS vote_score
        FROM seventeen_custom_puzzle_votes
        GROUP BY puzzle_id
      ) v ON v.puzzle_id = p.id
      ${where}
      ORDER BY ${order}
      LIMIT 60
    `,
    values,
  );

  return rows.map(mapPuzzle);
}

export async function getRandomCustomPuzzleId(
  difficulty?: PuzzleDifficulty,
): Promise<string | null> {
  await ensureSchema();
  const values: string[] = [];
  const where = difficulty ? "WHERE difficulty = ?" : "";
  if (difficulty) values.push(difficulty);
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `
      SELECT id
      FROM seventeen_custom_puzzles
      ${where}
      ORDER BY RAND()
      LIMIT 1
    `,
    values,
  );

  return rows[0] ? String(rows[0].id) : null;
}

export async function getCustomPuzzle(id: string): Promise<CustomPuzzle | null> {
  if (!/^\d+$/.test(id)) return null;

  await ensureSchema();
  const [rows] = await getPool().execute<CustomPuzzleRow[]>(
    `
      SELECT
        p.id,
        p.nickname,
        p.difficulty,
        p.cards,
        p.created_at,
        COALESCE(v.vote_score, 0) AS vote_score
      FROM seventeen_custom_puzzles p
      LEFT JOIN (
        SELECT puzzle_id, SUM(vote_value) AS vote_score
        FROM seventeen_custom_puzzle_votes
        GROUP BY puzzle_id
      ) v ON v.puzzle_id = p.id
      WHERE p.id = ?
      LIMIT 1
    `,
    [id],
  );

  return rows[0] ? mapPuzzle(rows[0]) : null;
}

export async function getCustomPuzzleVote(
  puzzleId: string,
  voterKey: string,
): Promise<-1 | 0 | 1> {
  if (!/^\d+$/.test(puzzleId)) return 0;

  await ensureSchema();
  const [rows] = await getPool().execute<RowDataPacket[]>(
    `
      SELECT vote_value
      FROM seventeen_custom_puzzle_votes
      WHERE puzzle_id = ? AND voter_key = ?
      LIMIT 1
    `,
    [puzzleId, voterKey],
  );
  const vote = Number(rows[0]?.vote_value ?? 0);
  return vote === 1 || vote === -1 ? vote : 0;
}

export async function setCustomPuzzleVote(input: {
  puzzleId: string;
  voterKey: string;
  vote: -1 | 0 | 1;
}): Promise<number | null> {
  if (!/^\d+$/.test(input.puzzleId)) return null;

  await ensureSchema();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [puzzles] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM seventeen_custom_puzzles WHERE id = ? FOR UPDATE`,
      [input.puzzleId],
    );
    if (!puzzles[0]) {
      await connection.rollback();
      return null;
    }

    if (input.vote === 0) {
      await connection.execute(
        `
          DELETE FROM seventeen_custom_puzzle_votes
          WHERE puzzle_id = ? AND voter_key = ?
        `,
        [input.puzzleId, input.voterKey],
      );
    } else {
      await connection.execute(
        `
          INSERT INTO seventeen_custom_puzzle_votes (puzzle_id, voter_key, vote_value)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE vote_value = VALUES(vote_value)
        `,
        [input.puzzleId, input.voterKey, input.vote],
      );
    }

    const [scores] = await connection.execute<RowDataPacket[]>(
      `
        SELECT COALESCE(SUM(vote_value), 0) AS vote_score
        FROM seventeen_custom_puzzle_votes
        WHERE puzzle_id = ?
      `,
      [input.puzzleId],
    );
    await connection.commit();
    return Number(scores[0]?.vote_score ?? 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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