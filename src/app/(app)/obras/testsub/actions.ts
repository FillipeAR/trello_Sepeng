"use server";

export interface TestState {
  message?: string;
}

export async function testSubAction(_prev: TestState, _formData: FormData): Promise<TestState> {
  return { message: "OBRAS TESTSUB OK" };
}
