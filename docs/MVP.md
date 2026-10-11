# OrgFlow

Your nonprofit's knowledge shouldn't leave when your employees do.

## Problem

Nonprofits face constant staff and leadership turnover. Departing employees take institutional knowledge, undocumented processes, donor relationships, and operational know-how with them. New hires spend months rediscovering information that already exists somewhere in the organization.

## Solution

An AI-powered institutional memory platform that turns an organization's existing knowledge into searchable, actionable playbooks. Think Process Street + AI knowledge management, built specifically for nonprofits.

## Original MVP

1. **Connect:** Securely integrate with Gmail, Outlook, Google Drive, and SharePoint.
2. **Capture:** AI identifies recurring workflows and generates step-by-step process playbooks from existing organizational content, subject to employee approval.
3. **Ask:** Staff ask questions in plain English and receive answers grounded in authorized organizational documents and emails.
4. **Transfer:** Generate role-specific handoff guides, onboarding materials, and knowledge-transfer checklists when an employee leaves.

## Target customer

Small and mid-sized nonprofits with 10–200 employees, limited IT resources, and recurring staff turnover.

## Business model

Monthly SaaS subscription priced by organization size, with nonprofit-friendly tiers. Exact pricing is undecided.

## Differentiation

Capture and organize knowledge nonprofits already have without requiring employees to document everything from scratch. Each generated process should reflect the organization's own sources and receive human approval.

## Vision

Become the permanent institutional memory of every nonprofit, preserving operational continuity regardless of who comes or goes.

## One-sentence pitch

We turn scattered nonprofit emails, documents, and employee knowledge into a living AI-powered playbook that survives staff turnover.

## Hackathon scope

The original MVP above is the broader product direction. The current demo focuses on **Capture**, with live **Gmail and Google Drive** connections and an **upload fallback**. See [shared memory](SHARED_MEMORY.md) for decisions, proposals, and implementation status.

## Luminal Flash in the MVP

The team has substantial free Luminal Flash credits (user-reported). Plan to use them for the AI processing inside **Capture**, starting with the donor stewardship demo. This is a proposed integration design, not implemented behavior. See [the integration plan](LUMINAL_FLASH.md) for the pipeline, verification requirements, and acceptance criteria.

Selected Gmail messages / Drive documents / uploaded text → extract source-backed workflow facts → build a searchable index → draft a donor stewardship playbook → employee reviews citations, fills gaps, and approves.

Luminal's proposed job is extracting facts and drafting the playbook. Embeddings can also use Flash if its available API and models support them; indexing and source storage remain application responsibilities. Existing credits should fund development, evaluation, and demo generation without making the product dependent on permanent free inference.

## Product design and build scope

The user-facing layout and authoring decisions are consolidated in [the product design brief](PRODUCT_DESIGN.md): AI-first Home, external Files explorer, server-hosted Knowledge Base, and a global chat/voice agent. The user authorized building both frontend and backend with subagents and adding Swagger API documentation. See shared memory for implementation status and assumptions.
