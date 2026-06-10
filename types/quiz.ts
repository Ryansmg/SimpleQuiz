export type QuizInfo = {
    id: string;
    name: string;
    description: string;
    length: number;
    shuffle: boolean;
    choiceLayout?: "grid" | "stack";

    maxScore: number;
    minScore: number;
    penalty: number;
    inputTime: number;
    comboBonusCnt: number;
    comboBonusScore: number;
};

export type ChoiceProblem = {
    type: "choice";
    legend: string;
    choices: string[];
    answer: number;
    choiceText?: string;
    commentary?: string;
};

export type AutoChoiceProblem = {
    type: "choice";
    legend: string;
    choices: `auto_${number}`;
    answer: string;
    choiceText?: string;
    commentary?: string;
};

export type FillProblem = {
    type: "fill";
    legend: string;
    answer: string;
    choices?: string[] | `auto_${number}`;
    choiceText?: string;
    commentary?: string;
    ignoreCase?: boolean;
    ignoreWhitespace?: boolean;
};

export type Problem = ChoiceProblem | AutoChoiceProblem | FillProblem;
export type PlayableProblem = ChoiceProblem | FillProblem;

export type ProblemSet = {
    id: string;
    problems: Problem[];
};

export type QuizResult = {
    quizId: string;
    score: number;
    totalTime: number;
    problemCount: number;
    correctCount: number;
    wrongCount: number;
    finalCombo: number;
};
