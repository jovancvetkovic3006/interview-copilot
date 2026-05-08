"use client";

import React, { useState, useRef } from "react";
import { useInterviewStore } from "@/store/interview-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  Difficulty,
  InterviewConfig,
  PreInterviewTask,
  UploadedFile,
  PredefinedQuestion,
  CodingTaskPreset,
  ReviewTemplate,
} from "@/types/interview";
import {
  PREDEFINED_QUESTIONS,
  CODING_TASK_PRESETS,
  REVIEW_TEMPLATES,
} from "@/data/presets";
import { buildCodingTaskGroups, buildQuestionGroups, flattenGroups } from "@/data/preset-helpers";
import {
  Play,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileText,
  Bot,
  User,
  Code2,
  Loader2,
  CheckCircle2,
  MessageSquare,
  ClipboardList,
  Settings,
  StickyNote,
  Eye,
  Pencil,
  Link2,
  ExternalLink,
} from "lucide-react";
import { PreTaskNotFoundError, getPreTask } from "@/lib/pretask-client";

const ROLE_CONFIG: Record<string, { topics: string[]; instructions: string }> = {
  "Frontend Developer": {
    topics: ["React", "TypeScript", "CSS", "Performance", "Testing", "Accessibility"],
    instructions: `You are a Frontend Developer interviewer. Focus on:
- UI component architecture and state management patterns
- CSS layout techniques, responsive design, and browser compatibility
- JavaScript/TypeScript fundamentals and async patterns
- Performance optimization (bundle size, rendering, lazy loading)
- Accessibility standards (WCAG, ARIA, semantic HTML)
- Testing strategies (unit, integration, E2E)
- Assign a coding task involving a React component or DOM manipulation`,
  },
  "Backend Developer": {
    topics: ["Node.js", "Databases", "REST APIs", "Authentication", "Microservices", "Caching"],
    instructions: `You are a Backend Developer interviewer. Focus on:
- API design (REST, GraphQL) and HTTP fundamentals
- Database design, SQL queries, indexing, and optimization
- Authentication/authorization patterns (JWT, OAuth, sessions)
- Microservices architecture and inter-service communication
- Caching strategies (Redis, CDN, in-memory)
- Error handling, logging, and monitoring
- Assign a coding task involving an API endpoint or data processing`,
  },
  "Full Stack Developer": {
    topics: ["React", "Node.js", "Databases", "TypeScript", "APIs", "DevOps"],
    instructions: `You are a Full Stack Developer interviewer. Focus on:
- End-to-end feature development from UI to database
- Frontend frameworks (React/Vue/Angular) and backend frameworks (Express/Nest)
- Database modeling and API design
- Authentication flows across client and server
- Deployment, CI/CD basics, and environment management
- How they debug issues across the full stack
- Assign a coding task that touches both frontend and backend logic`,
  },
  "Android Developer": {
    topics: ["Kotlin", "Jetpack Compose", "Android SDK", "MVVM", "Room", "Coroutines"],
    instructions: `You are an Android Developer interviewer. Focus on:
- Kotlin language features and best practices
- Android app architecture (MVVM, MVI, Clean Architecture)
- Jetpack Compose vs XML layouts
- Activity/Fragment lifecycle and navigation
- Room database, Retrofit, and data layer patterns
- Coroutines and Flow for async operations
- Testing on Android (unit tests, UI tests, Espresso)
- Assign a coding task involving Kotlin logic or a Compose UI component`,
  },
  "iOS Developer": {
    topics: ["Swift", "SwiftUI", "UIKit", "Combine", "Core Data", "Concurrency"],
    instructions: `You are an iOS Developer interviewer. Focus on:
- Swift language features (protocols, generics, optionals, value vs reference types)
- SwiftUI vs UIKit and when to use each
- App architecture (MVVM, Coordinator, TCA)
- Combine and async/await concurrency patterns
- Core Data, networking, and data persistence
- Memory management and ARC
- Testing strategies (XCTest, snapshot tests)
- Assign a coding task involving Swift logic or a SwiftUI view`,
  },
  "QA Engineer": {
    topics: ["Test Strategy", "Automation", "Selenium", "API Testing", "CI/CD", "Bug Reporting"],
    instructions: `You are a QA Engineer interviewer. Focus on:
- Test planning, test case design, and test strategy
- Manual vs automated testing and when to use each
- Test automation frameworks (Selenium, Cypress, Playwright, Appium)
- API testing (Postman, REST Assured) and contract testing
- Performance and load testing basics
- Bug reporting, reproduction steps, and severity classification
- Integration with CI/CD pipelines
- Assign a task: write test cases for a given feature or write an automation script`,
  },
  "DevOps Engineer": {
    topics: ["CI/CD", "Docker", "Kubernetes", "AWS", "Monitoring", "Infrastructure as Code"],
    instructions: `You are a DevOps Engineer interviewer. Focus on:
- CI/CD pipeline design and tooling (GitHub Actions, Jenkins, GitLab CI)
- Containerization (Docker) and orchestration (Kubernetes)
- Cloud platforms (AWS/GCP/Azure) and core services
- Infrastructure as Code (Terraform, Pulumi, CloudFormation)
- Monitoring, alerting, and observability (Prometheus, Grafana, ELK)
- Networking fundamentals, DNS, load balancing, and security
- Incident response and reliability practices
- Assign a task: design a deployment pipeline or write a Dockerfile/K8s manifest`,
  },
  "Data Engineer": {
    topics: ["SQL", "Python", "ETL", "Data Modeling", "Spark", "Airflow"],
    instructions: `You are a Data Engineer interviewer. Focus on:
- SQL proficiency (complex queries, window functions, optimization)
- ETL/ELT pipeline design and orchestration (Airflow, Dagster)
- Data modeling (star schema, snowflake, normalization)
- Big data processing (Spark, Flink, Kafka)
- Data quality, validation, and monitoring
- Cloud data platforms (Snowflake, BigQuery, Redshift)
- Assign a coding task involving SQL queries or a Python data transformation`,
  },
};

const ROLES = Object.keys(ROLE_CONFIG);

function getInstructionsForRole(role: string): string {
  return ROLE_CONFIG[role]?.instructions ?? ROLE_CONFIG[ROLES[0]].instructions;
}

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: "junior", label: "Junior", description: "0-2 years experience" },
  { value: "mid", label: "Mid", description: "2-5 years experience" },
  { value: "senior", label: "Senior", description: "5-8 years experience" },
  { value: "lead", label: "Lead", description: "8+ years experience" },
];

const STEPS = [
  { id: "setup", label: "Interview Setup", icon: Settings },
  { id: "candidate", label: "Candidate", icon: User },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "preparation", label: "Preparation", icon: ClipboardList },
];

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

interface SetupFormProps {
  onStart?: (config: InterviewConfig) => void;
  title?: string;
  subtitle?: string;
}

export function SetupForm({ onStart, title, subtitle }: SetupFormProps = {}) {
  const startSession = useInterviewStore((s) => s.startSession);
  const [step, setStep] = useState(0);

  // Step 1: Interview Setup
  const [role, setRole] = useState(ROLES[0]);
  const [customRole, setCustomRole] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [topics, setTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [duration, setDuration] = useState(30);

  // Step 2: Candidate
  const [candidateName, setCandidateName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [candidateNotes, setCandidateNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFileType, setUploadFileType] = useState<UploadedFile["type"]>("cv");

  // Step 3: Agent
  const [agentInstructions, setAgentInstructions] = useState(getInstructionsForRole(ROLES[0]));
  const [isCustomInstructions, setIsCustomInstructions] = useState(false);
  const [showEditInstructions, setShowEditInstructions] = useState(false);

  // Step 4: Preparation
  const [selectedQuestions, setSelectedQuestions] = useState<PredefinedQuestion[]>([]);
  const [selectedCodingTasks, setSelectedCodingTasks] = useState<CodingTaskPreset[]>([]);
  const [selectedReviewTemplate, setSelectedReviewTemplate] = useState<ReviewTemplate>(REVIEW_TEMPLATES[0]);
  const [enablePreTask, setEnablePreTask] = useState(false);
  const [preTaskTitle, setPreTaskTitle] = useState("");
  const [preTaskDescription, setPreTaskDescription] = useState("");
  const [preTaskLanguage, setPreTaskLanguage] = useState("javascript");
  const [preTaskStarterCode, setPreTaskStarterCode] = useState("");
  const [preTaskCode, setPreTaskCode] = useState("");
  // "Load from pre-task code" lookup — pulls the task + submission from the pretask PartyKit room.
  const [preTaskLookupCode, setPreTaskLookupCode] = useState("");
  const [preTaskLookupLoading, setPreTaskLookupLoading] = useState(false);
  const [preTaskLookupError, setPreTaskLookupError] = useState<string | null>(null);
  const [preTaskLoadedFrom, setPreTaskLoadedFrom] = useState<{
    code: string;
    submitted: boolean;
  } | null>(null);

  const handleLoadPreTask = async () => {
    const code = preTaskLookupCode.trim().toUpperCase();
    if (!code) return;
    setPreTaskLookupLoading(true);
    setPreTaskLookupError(null);
    try {
      const state = await getPreTask(code);
      setPreTaskTitle(state.def.title);
      setPreTaskDescription(state.def.description);
      setPreTaskLanguage(state.def.language);
      setPreTaskStarterCode(state.def.starterCode);
      setPreTaskCode(state.submission?.code ?? "");
      setEnablePreTask(true);
      setPreTaskLoadedFrom({ code: state.def.code, submitted: !!state.submission });
    } catch (err) {
      if (err instanceof PreTaskNotFoundError) {
        setPreTaskLookupError(`No pre-task found for code ${code}. Did you mistype it?`);
      } else {
        setPreTaskLookupError(err instanceof Error ? err.message : "Lookup failed");
      }
    } finally {
      setPreTaskLookupLoading(false);
    }
  };
  const [prepTab, setPrepTab] = useState<"questions" | "coding" | "pretask" | "review">("questions");

  const effectiveRole = customRole || role;

  const handleAddTopic = () => {
    if (customTopic.trim() && !topics.includes(customTopic.trim())) {
      setTopics([...topics, customTopic.trim()]);
      setCustomTopic("");
    }
  };

  const handleRemoveTopic = (topic: string) => {
    setTopics(topics.filter((t) => t !== topic));
  };

  const handleToggleSuggestedTopic = (topic: string) => {
    if (topics.includes(topic)) {
      handleRemoveTopic(topic);
    } else {
      setTopics([...topics, topic]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-cv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        const newFile: UploadedFile = {
          id: generateId(),
          name: data.fileName || file.name,
          type: uploadFileType,
          text: data.text,
        };
        setUploadedFiles([...uploadedFiles, newFile]);
      }
    } catch {
      alert("Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(uploadedFiles.filter((f) => f.id !== id));
  };

  const toggleQuestion = (q: PredefinedQuestion) => {
    if (selectedQuestions.find((sq) => sq.id === q.id)) {
      setSelectedQuestions(selectedQuestions.filter((sq) => sq.id !== q.id));
    } else {
      setSelectedQuestions([...selectedQuestions, q]);
    }
  };

  const toggleCodingTask = (task: CodingTaskPreset) => {
    if (selectedCodingTasks.find((t) => t.id === task.id)) {
      setSelectedCodingTasks(selectedCodingTasks.filter((t) => t.id !== task.id));
    } else {
      setSelectedCodingTasks([...selectedCodingTasks, task]);
    }
  };

  const handleStart = () => {
    if (!candidateName.trim()) return;

    const preInterviewTask: PreInterviewTask | undefined =
      enablePreTask && preTaskTitle.trim()
        ? {
            title: preTaskTitle.trim(),
            description: preTaskDescription.trim(),
            language: preTaskLanguage,
            starterCode: preTaskStarterCode.trim(),
            submittedCode: preTaskCode.trim() || undefined,
          }
        : undefined;

    const config: InterviewConfig = {
      candidateName: candidateName.trim(),
      role: effectiveRole,
      difficulty,
      topics,
      duration,
      agentInstructions: agentInstructions.trim(),
      uploadedFiles,
      notes: candidateNotes.trim(),
      preInterviewTask,
      selectedQuestions,
      selectedCodingTasks,
      reviewTemplate: selectedReviewTemplate,
    };

    if (onStart) {
      onStart(config);
    } else {
      startSession(config);
    }
  };

  const isStep2Valid = candidateName.trim().length > 0;
  const canProceed = step === 1 ? isStep2Valid : true;

  const nextStep = () => {
    if (step < STEPS.length - 1 && canProceed) setStep(step + 1);
  };
  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  const questionGroups = buildQuestionGroups(PREDEFINED_QUESTIONS[effectiveRole] || [], difficulty, effectiveRole);
  const codingTaskGroups = buildCodingTaskGroups(effectiveRole, difficulty, CODING_TASK_PRESETS);
  const availableQuestionsFlat = flattenGroups(questionGroups);
  const availableCodingTasksFlat = flattenGroups(codingTaskGroups);

  return (
    <div className="min-h-screen bg-linear-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-linear-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
            {title || "Interview Copilot"}
          </CardTitle>
          <CardDescription className="text-base">
            {subtitle || "Configure your technical interview session"}
          </CardDescription>
        </CardHeader>

        {/* Step Indicator */}
        <div className="px-6 pb-2">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = idx === step;
              const isCompleted = idx < step;
              return (
                <button
                  key={s.id}
                  onClick={() => (idx <= step || canProceed) && setStep(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                      : isCompleted
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                        : "text-zinc-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <CardContent className="space-y-6 min-h-100">
          {/* Step 1: Interview Setup */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role *</label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <Button
                      key={r}
                      variant={role === r && !customRole ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRole(r);
                        setCustomRole("");
                        if (!isCustomInstructions) {
                          setAgentInstructions(getInstructionsForRole(r));
                        }
                      }}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  placeholder="Or type a custom role..."
                  className="w-full h-10 px-3 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Difficulty Level</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setDifficulty(d.value)}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        difficulty === d.value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500"
                          : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      <div className="font-medium text-sm">{d.label}</div>
                      <div className="text-xs text-zinc-500">{d.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Topics *</label>
                {ROLE_CONFIG[role]?.topics && !customRole && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {ROLE_CONFIG[role].topics.map((topic) => (
                      <Badge
                        key={topic}
                        variant={topics.includes(topic) ? "default" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => handleToggleSuggestedTopic(topic)}
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
                    placeholder="Add a custom topic..."
                    className="flex-1 h-10 px-3 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <Button variant="outline" size="icon" onClick={handleAddTopic}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {topics.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {topics.map((topic) => (
                      <Badge key={topic} variant="default" className="gap-1">
                        {topic}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => handleRemoveTopic(topic)} />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Duration: {duration} minutes</label>
                <input
                  type="range"
                  min={15}
                  max={90}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>15 min</span>
                  <span>90 min</span>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Candidate */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Candidate Name *</label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="Enter candidate's name"
                  className="w-full h-10 px-3 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>

              {/* Multi-file Upload */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Upload className="h-4 w-4 text-violet-600" />
                  Upload Files
                </label>
                <p className="text-xs text-zinc-500">
                  Upload CV, biography, or other documents. The agent will reference these during the interview.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {(["cv", "bio", "other"] as const).map((t) => (
                      <Badge
                        key={t}
                        variant={uploadFileType === t ? "default" : "secondary"}
                        className="cursor-pointer capitalize text-xs"
                        onClick={() => setUploadFileType(t)}
                      >
                        {t === "cv" ? "CV/Resume" : t === "bio" ? "Biography" : "Other"}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload
                  </Button>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    {uploadedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{file.name}</div>
                            <div className="text-xs text-zinc-400">
                              {file.type === "cv" ? "CV/Resume" : file.type === "bio" ? "Biography" : "Other"} &middot; {file.text.length} chars
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveFile(file.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-amber-600" />
                  Notes about Candidate
                </label>
                <textarea
                  value={candidateNotes}
                  onChange={(e) => setCandidateNotes(e.target.value)}
                  placeholder={"Referral notes, background info, previous interactions, etc."}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 resize-none"
                />
              </div>
            </>
          )}

          {/* Step 3: Agent */}
          {step === 2 && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Bot className="h-4 w-4 text-blue-600" />
                    Interviewer Agent &mdash; {effectiveRole}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEditInstructions(!showEditInstructions)}
                  >
                    {showEditInstructions ? (
                      <><Eye className="h-3.5 w-3.5" /> View</>
                    ) : (
                      <><Pencil className="h-3.5 w-3.5" /> Edit</>
                    )}
                  </Button>
                </div>

                {!showEditInstructions ? (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4">
                    <div className="text-sm whitespace-pre-wrap leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {agentInstructions}
                    </div>
                    {isCustomInstructions && (
                      <Badge variant="secondary" className="mt-3 text-xs">Customized</Badge>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={agentInstructions}
                      onChange={(e) => {
                        setAgentInstructions(e.target.value);
                        setIsCustomInstructions(true);
                      }}
                      rows={14}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-400">{agentInstructions.length} characters</p>
                      {isCustomInstructions && (
                        <button
                          onClick={() => {
                            setAgentInstructions(getInstructionsForRole(effectiveRole));
                            setIsCustomInstructions(false);
                          }}
                          className="text-xs text-blue-600 hover:underline cursor-pointer"
                        >
                          Reset to role default
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    The agent will also receive: uploaded files ({uploadedFiles.length}), candidate notes,
                    selected questions ({selectedQuestions.length}), and coding tasks ({selectedCodingTasks.length}) as additional context.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Step 4: Preparation */}
          {step === 3 && (
            <>
              {/* Sub-tabs */}
              <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 -mt-2 mb-2">
                {([
                  { id: "questions" as const, label: "Questions", icon: MessageSquare, count: selectedQuestions.length },
                  { id: "coding" as const, label: "Coding Tasks", icon: Code2, count: selectedCodingTasks.length },
                  { id: "pretask" as const, label: "Pre-Task", icon: ClipboardList, count: enablePreTask ? 1 : 0 },
                  { id: "review" as const, label: "Review", icon: FileText, count: 0 },
                ]).map((tab) => {
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setPrepTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                        prepTab === tab.id
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-zinc-400 hover:text-zinc-600"
                      }`}
                    >
                      <TabIcon className="h-3.5 w-3.5" />
                      {tab.label}
                      {tab.count > 0 && (
                        <span className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs px-1.5 rounded-full">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Questions sub-tab */}
              {prepTab === "questions" && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500">
                    Select questions for the agent to ask. The agent will weave these into the conversation naturally.
                    Lists are ordered by seniority (matched level first), then by strand for Full Stack (C# · .NET, React, shared), then all-level questions.
                  </p>
                  {availableQuestionsFlat.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                      {questionGroups.map((group) => (
                        <div key={group.heading} className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 px-0.5">{group.heading}</p>
                          {group.items.map((q) => {
                            const isSelected = selectedQuestions.find((sq) => sq.id === q.id);
                            return (
                              <button
                                key={q.id}
                                onClick={() => toggleQuestion(q)}
                                className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500"
                                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-sm">{q.question}</div>
                                  {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
                                </div>
                                <Badge variant="secondary" className="mt-1.5 text-xs">{q.category}</Badge>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400 py-4 text-center">
                      No predefined questions for &quot;{effectiveRole}&quot;. The agent will generate questions based on the role and topics.
                    </p>
                  )}
                </div>
              )}

              {/* Coding Tasks sub-tab */}
              {prepTab === "coding" && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500">
                    Select coding tasks to use during the interview. Role-specific tasks appear first (hardest first), then General.
                  </p>
                  {availableCodingTasksFlat.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                      {codingTaskGroups.map((group) => (
                        <div key={group.heading} className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 px-0.5">{group.heading}</p>
                          {group.items.map((task) => {
                            const isSelected = selectedCodingTasks.find((t) => t.id === task.id);
                            return (
                              <button
                                key={task.id}
                                onClick={() => toggleCodingTask(task)}
                                className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500"
                                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-medium">{task.title}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">{task.description}</div>
                                  </div>
                                  {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
                                </div>
                                <div className="flex gap-1.5 mt-2 flex-wrap">
                                  <Badge variant="secondary" className="text-xs">{task.language}</Badge>
                                  <Badge variant="secondary" className="text-xs capitalize">{task.difficulty}</Badge>
                                  {task.staticReview && (
                                    <Badge variant="outline" className="text-xs border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200">
                                      Static review
                                    </Badge>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400 py-4 text-center">
                      No predefined coding tasks for &quot;{effectiveRole}&quot;. The agent will generate tasks based on the role.
                    </p>
                  )}
                </div>
              )}

              {/* Pre-Task sub-tab */}
              {prepTab === "pretask" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500">
                      Assign a task before the interview. Paste submitted code for the agent to review.
                    </p>
                    <button
                      onClick={() => setEnablePreTask(!enablePreTask)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                        enablePreTask ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          enablePreTask ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Take-home lookup: pull a previously-created take-home + the candidate's submission. */}
                  <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/30 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-blue-900 dark:text-blue-200">
                        Load from take-home code
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800/80 dark:text-blue-200/70">
                      Already sent a take-home link to the candidate? Paste the code to import the task and
                      their submission.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={preTaskLookupCode}
                        onChange={(e) => {
                          setPreTaskLookupCode(e.target.value.toUpperCase());
                          setPreTaskLookupError(null);
                        }}
                        placeholder="ABC123"
                        maxLength={8}
                        className="flex-1 h-9 px-3 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono text-center tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleLoadPreTask}
                        disabled={preTaskLookupLoading || preTaskLookupCode.trim().length < 4}
                      >
                        {preTaskLookupLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Load"
                        )}
                      </Button>
                    </div>
                    {preTaskLookupError && (
                      <p className="text-[11px] text-red-600 dark:text-red-400">{preTaskLookupError}</p>
                    )}
                    {preTaskLoadedFrom && !preTaskLookupError && (
                      <p className="text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Loaded {preTaskLoadedFrom.code}
                        {preTaskLoadedFrom.submitted ? " with candidate submission." : " — no submission yet."}
                      </p>
                    )}
                    <a
                      href="/task/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-300 hover:underline"
                    >
                      Create a new take-home
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {enablePreTask && (
                    <div className="space-y-3 pt-1">
                      <input
                        type="text"
                        value={preTaskTitle}
                        onChange={(e) => setPreTaskTitle(e.target.value)}
                        placeholder="Task title"
                        className="w-full h-10 px-3 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <textarea
                        value={preTaskDescription}
                        onChange={(e) => setPreTaskDescription(e.target.value)}
                        placeholder="Task description..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 resize-none"
                      />
                      <div className="flex flex-wrap gap-2">
                        {["javascript", "typescript", "python", "java", "kotlin", "swift", "go", "sql"].map((lang) => (
                          <Badge
                            key={lang}
                            variant={preTaskLanguage === lang ? "default" : "secondary"}
                            className="cursor-pointer text-xs"
                            onClick={() => setPreTaskLanguage(lang)}
                          >
                            {lang}
                          </Badge>
                        ))}
                      </div>
                      <textarea
                        value={preTaskStarterCode}
                        onChange={(e) => setPreTaskStarterCode(e.target.value)}
                        placeholder="Starter code (optional)..."
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 resize-none"
                      />
                      <textarea
                        value={preTaskCode}
                        onChange={(e) => setPreTaskCode(e.target.value)}
                        placeholder="Candidate's submitted code (optional)..."
                        rows={4}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 resize-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Review Template sub-tab */}
              {prepTab === "review" && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500">
                    Choose a review template for the final interview report. This determines which categories are scored.
                  </p>
                  <div className="space-y-2">
                    {REVIEW_TEMPLATES.map((tmpl) => {
                      const isSelected = selectedReviewTemplate.id === tmpl.id;
                      return (
                        <button
                          key={tmpl.id}
                          onClick={() => setSelectedReviewTemplate(tmpl)}
                          className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500"
                              : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">{tmpl.name}</div>
                              <div className="text-xs text-zinc-500 mt-0.5">{tmpl.description}</div>
                            </div>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {tmpl.categories.map((cat) => (
                              <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <Button variant="outline" onClick={prevStep} disabled={step === 0}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <span className="text-xs text-zinc-400">
              Step {step + 1} of {STEPS.length}
            </span>

            {step < STEPS.length - 1 ? (
              <Button onClick={nextStep} disabled={!canProceed}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={!isStep2Valid}
                variant="default"
                size="lg"
              >
                <Play className="h-5 w-5" />
                Start Interview
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
