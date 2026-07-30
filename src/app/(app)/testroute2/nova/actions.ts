"use server";

export interface TestState {
  message?: string;
}

export async function testAction2(_prev: TestState, _formData: FormData): Promise<TestState> {
  return { message: "TESTROUTE2 NOVA OK" };
}
