import type { QuizTemplate } from "@/types/quiz";

/** Pre-built quiz templates — up to 20 MCQ questions, 4 options each, 3 min per question at runtime. */
export const QUIZ_TEMPLATES: QuizTemplate[] = [
  {
    id: "be-senior",
    title: "Backend Senior",
    track: "Backend Senior",
    description: "System design, APIs, databases, concurrency, and distributed systems fundamentals.",
    questions: [
      {
        id: "be-s-1",
        question: "Which HTTP status code is most appropriate when a resource was created successfully?",
        options: ["200 OK", "201 Created", "204 No Content", "302 Found"],
        correctIndex: 1,
      },
      {
        id: "be-s-2",
        question: "In a relational database, what is the primary purpose of an index?",
        options: [
          "Enforce referential integrity",
          "Speed up read queries on indexed columns",
          "Guarantee serializable isolation",
          "Compress row storage on disk",
        ],
        correctIndex: 1,
      },
      {
        id: "be-s-3",
        question: "Which CAP theorem statement is correct?",
        options: [
          "You can always have Consistency, Availability, and Partition tolerance",
          "During a network partition you must choose between C and A",
          "Partition tolerance is optional in distributed systems",
          "Availability implies strong consistency",
        ],
        correctIndex: 1,
      },
      {
        id: "be-s-4",
        question: "What is idempotency in the context of REST APIs?",
        options: [
          "Requests always return the same JSON schema",
          "Repeating the same request has the same effect as doing it once",
          "Endpoints must use GET only",
          "The server never persists state",
        ],
        correctIndex: 1,
      },
      {
        id: "be-s-5",
        question: "Which pattern helps prevent cache stampede (thundering herd)?",
        options: ["Write-through only", "Single-flight / request coalescing", "LRU eviction", "Sharding by primary key"],
        correctIndex: 1,
      },
      {
        id: "be-s-6",
        question: "In message queues, at-least-once delivery typically requires consumers to be:",
        options: ["Stateless", "Idempotent", "Synchronous", "Single-threaded only"],
        correctIndex: 1,
      },
      {
        id: "be-s-7",
        question: "Which isolation level prevents non-repeatable reads but not phantom reads?",
        options: ["Read uncommitted", "Read committed", "Repeatable read", "Serializable"],
        correctIndex: 2,
      },
      {
        id: "be-s-8",
        question: "What is the main trade-off of synchronous replication in a DB cluster?",
        options: [
          "Higher write latency for stronger durability",
          "Lower storage cost",
          "Automatic sharding",
          "Elimination of failover",
        ],
        correctIndex: 0,
      },
      {
        id: "be-s-9",
        question: "Which approach best reduces coupling between microservices?",
        options: [
          "Shared monolithic database",
          "Event-driven async communication with explicit contracts",
          "Direct in-process calls",
          "Global mutable singleton cache",
        ],
        correctIndex: 1,
      },
      {
        id: "be-s-10",
        question: "JWT access tokens are typically validated by checking:",
        options: [
          "Only the token length",
          "Signature, expiry, and claims such as audience/issuer",
          "The client's IP address only",
          "Whether the token is stored in Redis",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "fe-senior",
    title: "Frontend Senior",
    track: "Frontend Senior",
    description: "React, performance, accessibility, browser APIs, and frontend architecture.",
    questions: [
      {
        id: "fe-s-1",
        question: "What problem does React's key prop primarily solve in lists?",
        options: [
          "CSS styling of list items",
          "Helping React identify which items changed, were added, or removed",
          "Enabling server-side rendering",
          "Preventing XSS attacks",
        ],
        correctIndex: 1,
      },
      {
        id: "fe-s-2",
        question: "Which metric reflects how long the main thread is blocked before interactivity?",
        options: ["LCP", "FID / INP", "CLS", "TTFB"],
        correctIndex: 1,
      },
      {
        id: "fe-s-3",
        question: "What is the correct way to avoid stale closures in a useEffect with async work?",
        options: [
          "Never use dependencies",
          "Include stable dependencies or use cleanup / abort flags",
          "Always use setInterval without cleanup",
          "Disable strict mode",
        ],
        correctIndex: 1,
      },
      {
        id: "fe-s-4",
        question: "Which HTML element provides the best default accessibility for a site navigation region?",
        options: ["<motion.nav>", "<div role='banner'>", "<nav>", "<section>"],
        correctIndex: 2,
      },
      {
        id: "fe-s-5",
        question: "Code splitting in a SPA is primarily used to:",
        options: [
          "Reduce initial bundle size by loading routes/chunks on demand",
          "Eliminate the need for caching",
          "Replace TypeScript with JavaScript",
          "Disable tree shaking",
        ],
        correctIndex: 0,
      },
      {
        id: "fe-s-6",
        question: "Cumulative Layout Shift (CLS) measures:",
        options: [
          "Unexpected visual movement during page load",
          "Time to first byte",
          "JavaScript parse time only",
          "Number of HTTP requests",
        ],
        correctIndex: 0,
      },
      {
        id: "fe-s-7",
        question: "Which CSS unit is usually best for fluid typography scaling?",
        options: ["px only", "rem / clamp()", "pt", "cm"],
        correctIndex: 1,
      },
      {
        id: "fe-s-8",
        question: "In React 18+, automatic batching means:",
        options: [
          "State updates in event handlers, promises, and timeouts may batch into one render",
          "Components never re-render",
          "Only class components batch updates",
          "useState cannot be called twice",
        ],
        correctIndex: 0,
      },
      {
        id: "fe-s-9",
        question: "What is a common pitfall when storing derived UI state?",
        options: [
          "Deriving it from props/state instead of duplicating it in separate state",
          "Using memoization",
          "Using TypeScript",
          "Using semantic HTML",
        ],
        correctIndex: 0,
      },
      {
        id: "fe-s-10",
        question: "Service Workers are most commonly used for:",
        options: [
          "Running SQL queries",
          "Offline caching and network interception",
          "Replacing React state",
          "Server-side authentication",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    id: "fullstack-mid",
    title: "Full Stack Mid",
    track: "Full Stack Mid",
    description: "Breadth across frontend, backend, APIs, and basic system design.",
    questions: [
      {
        id: "fs-m-1",
        question: "Which method is idempotent by HTTP specification?",
        options: ["POST", "PATCH", "PUT", "CONNECT"],
        correctIndex: 2,
      },
      {
        id: "fs-m-2",
        question: "CORS preflight requests use which HTTP method?",
        options: ["GET", "OPTIONS", "HEAD", "TRACE"],
        correctIndex: 1,
      },
      {
        id: "fs-m-3",
        question: "SQL JOIN that returns all rows from the left table and matching rows from the right is:",
        options: ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "FULL OUTER JOIN"],
        correctIndex: 1,
      },
      {
        id: "fs-m-4",
        question: "Which stores data in the browser with a simple key-value API and no expiry by default?",
        options: ["sessionStorage", "localStorage", "IndexedDB only", "Cookies only"],
        correctIndex: 1,
      },
      {
        id: "fs-m-5",
        question: "Environment variables for secrets in a Node.js app should:",
        options: [
          "Be committed to git for reproducibility",
          "Be injected at runtime, not hard-coded in source",
          "Be stored in client-side bundle",
          "Be logged on startup",
        ],
        correctIndex: 1,
      },
      {
        id: "fs-m-6",
        question: "What does ORM primarily abstract?",
        options: [
          "DNS resolution",
          "Object mapping between application code and relational rows",
          "CSS preprocessing",
          "GPU rendering",
        ],
        correctIndex: 1,
      },
      {
        id: "fs-m-7",
        question: "Which React hook is appropriate for subscribing to an external store?",
        options: ["useMemo only", "useSyncExternalStore / useEffect with cleanup", "useId", "useDeferredValue only"],
        correctIndex: 1,
      },
      {
        id: "fs-m-8",
        question: "Rate limiting at the API gateway helps primarily with:",
        options: [
          "Improving SQL index usage",
          "Protecting backends from abuse and overload",
          "Eliminating need for authentication",
          "Compressing images",
        ],
        correctIndex: 1,
      },
      {
        id: "fs-m-9",
        question: "A 404 on a REST resource usually means:",
        options: [
          "The server crashed",
          "The requested resource identifier was not found",
          "The client is unauthorized",
          "The request body was too large",
        ],
        correctIndex: 1,
      },
      {
        id: "fs-m-10",
        question: "TypeScript 'strict' mode mainly improves:",
        options: [
          "Runtime performance",
          "Type safety and catching null/undefined issues at compile time",
          "Bundle size",
          "Browser compatibility",
        ],
        correctIndex: 1,
      },
    ],
  },
];

export const MAX_QUIZ_QUESTIONS = 20;
export const DEFAULT_SECONDS_PER_QUESTION = 180;

export function getQuizTemplate(id: string): QuizTemplate | undefined {
  return QUIZ_TEMPLATES.find((t) => t.id === id);
}
