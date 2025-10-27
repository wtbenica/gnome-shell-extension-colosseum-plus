### Refactoring Guidance

- **Single Responsibility Principle**: Keep files, classes, and functions focused.
- **Smaller Files Preferred**: Break down large files into smaller, more manageable ones. Organize files into directories where appropriate.
- **File Organization**: Ensure files are logically grouped and organized. Consider overall project structure whenever files are changed, added, or removed.
- **Documentation**: Use JS/TS Doc comments for all exported entities.
- **Code Simplification**: Favor clear, concise, and idiomatic code.
- **Dead Code Removal**: Remove unused or deprecated code.
- **Review & Verification**: Test thoroughly after refactoring.

---

### TypeScript Conversion Policy

- Prefer converting JavaScript files to TypeScript during refactoring.
- Add type annotations and use interfaces to clarify data structures.
- Update imports and build scripts to reference `.ts` files.
- Document any blockers or partial conversions for follow-up.

---

### Comments
- Use comments to explain complex logic or decisions.
- Avoid redundant comments that restate obvious code behavior.
- Do not reference change history; focus on current code clarity.
- Keep comments concise and relevant, but complete. 