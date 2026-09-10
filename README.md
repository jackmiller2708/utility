# Utility Platform

A private, local-first utility platform built around a NestJS backend, Angular web client, and Effect-based application/tool layer.

The host machine provides Linux-native capabilities such as Sharp, Poppler, and eventually FFmpeg. The browser only interacts with typed tool APIs.

## Architecture principle

> The server is a capability runtime, not a command executor.

Tools expose typed user intent. Runtime capabilities provide filesystem, workspace, process, artifact, and OS integration.

## Stack

- Angular — web client
- NestJS — HTTP/API application shell
- TypeScript
- Effect + Effect Schema — application logic, services, errors, schemas
- Sharp — image manipulation
- Poppler-utils — PDF manipulation
- FFmpeg — planned media adapter

## Current scope

Web only. No Tauri/native desktop application is part of the architecture.

## First vertical slice

Angular → NestJS → Effect → Tool Registry → Image.resize → Sharp → Workspace → Artifact download.
