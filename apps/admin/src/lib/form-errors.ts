import axios from "axios";

/**
 * Polish-3 — Backend ValidationPipe `{ errors: { field: msg } }` payload'ından
 * field error map'i çıkarır. Generic 4xx/5xx'lerde boş obje döner.
 */
export function extractFieldErrors(error: unknown): Record<string, string> {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 400 &&
    error.response.data?.errors &&
    typeof error.response.data.errors === "object"
  ) {
    return error.response.data.errors as Record<string, string>;
  }
  return {};
}

/**
 * Backend response'undan mesajı yakala — `message` string veya string[].
 */
export function extractErrorMessage(
  error: unknown,
  fallback = "İşlem gerçekleştirilemedi",
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (typeof data?.message === "string") return data.message;
    if (Array.isArray(data?.message) && data.message[0]) return data.message[0];
  }
  return fallback;
}
