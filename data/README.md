# Interview presets (YAML)

Q&A and coding-task presets the app shows in the Setup form / room panel.

```
data/
  questions/<role-slug>.yaml      # one file per role
  coding-tasks/<role-slug>.yaml   # one file per role
```

`role-slug` is just the role name lowercased with non-alphanumeric runs → `-`
(e.g. `Frontend Developer` → `frontend-developer.yaml`). The slug is only the filename;
the canonical role name lives inside the YAML as the top-level `role` field.

## Editing

Edit the YAML and run:

```
npm run presets:build
```

That regenerates `src/data/presets.generated.ts` (also committed). The build script also runs
automatically before `npm run dev` and `npm run build`, so you can simply restart dev after
edits.

## Question shape

```yaml
role: Frontend Developer       # canonical role name (must be unique across question files)
questions:
  - id: fe-1                   # unique across ALL question files
    question: "Explain the virtual DOM and how React uses it."
    category: React
    levels: [mid, senior]      # optional; omit to show at every difficulty
    strand: frontend           # optional; only used by the Full Stack role to sub-group
```

- `levels` allowed values: `junior`, `mid`, `senior`, `lead`.
- `strand` allowed values: `frontend`, `backend`, `fullstack` (sub-grouping inside Full Stack).

## Coding-task shape

```yaml
role: General                  # or any specific role; must be unique across task files
tasks:
  - id: ct-gen-1               # unique across ALL task files
    title: "Find the Maximum in an Array"
    description: |             # multi-line markdown-ish text is fine
      What it is: ...
      Goal: ...
      What to do: ...
      Finish when: ...
    starterCode: |
      function findMax(numbers) {
        // Implement
      }
    language: javascript       # any Monaco language id
    difficulty: junior         # junior | mid | senior | lead
    strand: frontend           # optional; only used by Full Stack
    staticReview: false        # optional; true = discussion / review task, no run
```

A task with role `General` is shown alongside every role-specific bucket — it is the catch-all
warm-up pool.

## Validation

`npm run presets:build` fails the build (with a clear message) when:

- A required field is missing.
- An `id` is duplicated across files.
- A role name appears in more than one file of the same kind.
- `difficulty`, `levels`, or `strand` use an unknown value.

So if the build passes, the data is shape-valid.

## Adding a brand-new role

1. Drop a new file in `data/questions/<role-slug>.yaml` and / or `data/coding-tasks/<role-slug>.yaml`.
2. Make sure the role name (the `role` field) matches the role used in the Setup form. New roles are
   _not_ auto-added to the Setup form's role selector — that list lives in
   `src/components/setup-form.tsx`.
