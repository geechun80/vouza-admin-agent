// Loaded before every test file (package.json "test" script).
// Tests use a throwaway master key so they never call the OS key store
// (Windows DPAPI / macOS Keychain) or create data/.secret-key in the repo.
import { randomBytes } from "node:crypto";
process.env.VOUZA_SECRET_KEY ??= randomBytes(32).toString("hex");
