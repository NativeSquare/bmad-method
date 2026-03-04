# Story {{epic_num}}.{{story_num}}: {{story_title}}

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a {{role}},
I want {{action}},
so that {{benefit}}.

## Acceptance Criteria

1. [Add acceptance criteria from epics/PRD]

## Tasks / Subtasks

- [ ] Task 1 (AC: #)
  - [ ] Subtask 1.1
- [ ] Task 2 (AC: #)
  - [ ] Subtask 2.1

## Dev Notes

- Relevant architecture patterns and constraints
- Source tree components to touch
- Testing standards summary

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Cite all technical details with source paths and sections, e.g. [Source: docs/<file>.md#Section]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

<!-- CONDITIONAL: Include only when prototype_config is enabled and story involves UI/frontend work -->
## Prototype Reference

> ⚠️ **The web prototype is a VISUAL REFERENCE ONLY.** Use it for fonts, colors, spacing, and layout.
> Everything else — interactions, navigation, animations, platform conventions — MUST be adapted for the target platform.
> When building a native app, follow native patterns (e.g., React Navigation, native gestures, platform-specific UI components).

- **Prototype route(s):** {{prototype_routes}}
- **Key components to reference:** {{prototype_components}}
- **Design tokens extracted:** {{design_tokens}} (fonts, colors, spacing)
- **Source files:** {{prototype_source_paths}}
- **What to match:** Typography, color palette, spacing/padding, general layout structure
- **What to adapt:** Navigation patterns, touch interactions, animations, platform-specific controls, scrolling behavior, native component equivalents
