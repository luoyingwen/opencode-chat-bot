# Concept

This document defines the current product concept and boundaries for OpenCode Chat Bot.

## Vision

OpenCode Chat Bot is designed as a **single OpenCode CLI window in chat**.

The goal is to provide a simple, reliable, mobile-friendly way to run and monitor OpenCode workflows from DingTalk or Feishu while keeping behavior predictable.

## Core Concept

- Primary mode is private chat (DM) with the bot.
- The bot favors a single active interaction context for reliable flows.
- Platform-native chat UI is used intentionally, including lightweight in-chat controls where supported.

## Non-Goals (for now)

The following are intentionally out of scope at this stage:

- Group-first usage model
- Parallel multi-session operation across multiple forum topics/threads
- Multi-user access model
- Full forum-thread orchestration as a primary interaction design

Parallel multi-session and group-oriented workflows remain intentionally out of scope for this repository.

## Why This Direction

This direction is intentional and practical:

- It keeps behavior predictable and easier to stabilize.
- It reduces race conditions in interactive flows (questions, permissions, confirmations).
- It preserves the main UX pattern (reply keyboard plus a compact command surface).
- It avoids over-expanding slash commands and fragmented inline-only navigation.

Platform API constraints are also a practical reason to avoid thread-heavy parallel usage and overly fragmented interaction flows.

## Current Priorities

The project priorities are intentionally long-term and concept-aligned:

- Keep the bot stable and behavior predictable in daily use
- Expand functionality within the current concept boundaries
- Improve test coverage and maintainability for safe iteration
- Evolve the architecture without changing the core interaction model

## Change Policy

If a proposal changes this concept (for example, making group threads a primary mode), open an issue/discussion first and wait for maintainer alignment before implementation.

## Revisit Conditions

This concept can be revisited later after major stability, test, and architecture milestones are completed.

