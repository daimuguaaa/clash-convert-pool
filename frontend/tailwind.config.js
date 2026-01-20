/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Rational Modernism Palette
                primary: "#111111", // Main text matches this too
                secondary: "#666666",
                border: "#e5e5e5",
                "border-dark": "#d4d4d4",
                sidebar: "#fbfbfb",
                background: "#ffffff",
                // Status dots
                success: "#22c55e", // Green-500
                warning: "#f97316", // Orange-500
                error: "#ef4444",   // Red-500
            },
            borderRadius: {
                DEFAULT: "4px",
                md: "6px",
                lg: "8px" // Avoid large radii
            },
            boxShadow: {
                // Strictly minimal shadow usage
                none: "none",
                modal: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
