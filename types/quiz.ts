export type QuizInfo = {
    id: string;
    name: string;
    description: string;
    length: number;
    shuffle: boolean;

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
    commentary?: string;
};

export type FillProblem = {
    type: "fill";
    legend: string;
    answer: string;
    commentary?: string;
    ignoreCase?: boolean;
    ignoreWhitespace?: boolean;
};

export type Problem = ChoiceProblem | FillProblem;

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