# Shared styles

`theme.css` defines light/dark tokens and higher-priority utility-layer layout rules. Feature-specific legacy CSS stays in its feature folder under `@layer legacy`; the order is declared in `src/index.css`.

Keep responsive fixes near the shared component rule they affect. Check phone-width wrapping and horizontal overflow when a button or record row can contain long user or source text.
