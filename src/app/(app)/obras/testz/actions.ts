"use server";

export interface TestState {
  message?: string;
}

export async function testZAction(_prev: TestState, formData: FormData): Promise<TestState> {
  return { message: `OK: ${formData.get("a")}/${formData.get("b")}/${formData.get("c")}` };
}
