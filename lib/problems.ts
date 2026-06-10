import fs from "fs/promises";
import path from "path";
import type { ProblemSet } from "@/types/quiz";

export async function getProblemSet(id: string): Promise<ProblemSet | null> {
    try {
        const filePath = path.join(
            process.cwd(),
            "data",
            "problems",
            `${id}.json`
        );

        const raw = await fs.readFile(filePath, "utf-8");
        return JSON.parse(raw) as ProblemSet;
    } catch {
        return null;
    }
}