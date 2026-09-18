// Component-project setup (happy-dom): adds jest-dom matchers and clears the
// DOM between tests so renders don't leak across cases.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
