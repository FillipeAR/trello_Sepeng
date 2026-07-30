"use server";

export interface TestState {
  message?: string;
}

export async function testAction(_prev: TestState, _formData: FormData): Promise<TestState> {
  return { message: "TESTROUTE OK" };
}
