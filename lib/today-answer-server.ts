import { getDb } from "../db";
import { readTodayAnswer, type AnswerClient, type TodayAnswer } from "./today-answer";

/**
 * Server-only entry: the D1 binding exists only inside the Worker. A page
 * rendered anywhere else (a build, a test) simply gets no answer line.
 */
export async function loadTodayAnswer(): Promise<TodayAnswer | null> {
  try {
    const client = (await getDb()).$client as unknown as AnswerClient;
    return await readTodayAnswer(client);
  } catch {
    return null;
  }
}
