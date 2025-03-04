# Market Movers Hub Development Guide

## Commands
- `bun install` - Install dependencies
- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run build:dev` - Build for development
- `bun run lint` - Run ESLint
- `bun run preview` - Preview production build

## Code Style
- **TypeScript**: Use types for all parameters and return values
- **Formatting**: Follow existing component structure from shadcn/ui
- **Naming**:
  - React components: PascalCase with descriptive names
  - Hooks: camelCase prefixed with "use"
  - Files: Match component/function names
- **Imports**: Group by external libraries, internal components, then types/utilities
- **Error handling**: Use try/catch with toast notifications for user-facing errors
- **State Management**: Use hooks and context when appropriate

## Project Structure
- Components organized by feature area (market, account)
- UI components in dedicated /ui directory
- Supabase edge functions for backend operations
- Follow existing patterns when adding new features

Always check existing code patterns before implementing new features.