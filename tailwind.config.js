/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gamer: {
          bg: '#000000',
          panel: '#1a1a1a',
          cyan: '#00ffff',
          cyanDim: 'rgba(0, 255, 255, 0.1)',
          text: '#e0e0e0',
          muted: '#888888'
        }
      },
      fontFamily: {
        gamer: ['Orbitron', 'sans-serif'],
        body: ['Inter', 'sans-serif']
      },
      boxShadow: {
        'neon': '0 0 10px rgba(0, 255, 255, 0.5), 0 0 20px rgba(0, 255, 255, 0.3)',
        'neon-hover': '0 0 15px rgba(0, 255, 255, 0.7), 0 0 30px rgba(0, 255, 255, 0.5)',
      },
      animation: {
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 255, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 255, 0.6), 0 0 10px rgba(0, 255, 255, 0.4)' }
        }
      }
    },
  },
  plugins: [],
}
