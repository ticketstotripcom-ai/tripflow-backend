import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, XCircle } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const rotatingPlaceholders = [
  "Search by Trip ID…",
  "Search Customer Name…",
  "Search Phone / Email…",
  "Search Consultant Name…",
  "Search Remarks…",
];

export default function SearchBar({
  value,
  onChange,
  placeholder,
}: SearchBarProps) {
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState(
    placeholder || rotatingPlaceholders[0]
  );
  const [internalValue, setInternalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // 🔄 Rotate placeholder every 3 seconds
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % rotatingPlaceholders.length;
      if (!value) {
        setAnimatedPlaceholder(rotatingPlaceholders[index]);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [value]);

  // ⏳ Debounce input for 300ms for heavy filtering
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(internalValue);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [internalValue, onChange]);

  return (
    <div
      className={`
        relative transition-all duration-300
        ${isFocused ? "scale-[1.02]" : "scale-100"}
      `}
    >
      {/* 🔍 Animated search icon */}
      <Search
        className={`
          absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4
          transition-all duration-300
          ${isFocused ? "text-primary animate-pulse" : "text-muted-foreground"}
        `}
      />

      {/* ❄ Glassmorphism Input */}
      <Input
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        placeholder={animatedPlaceholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`
          pl-10 pr-10 h-11 text-sm rounded-xl
          bg-white/40 dark:bg-white/10
          backdrop-blur-md shadow-sm
          border border-white/30 dark:border-white/10
          focus:ring-2 focus:ring-primary/40
          focus:border-primary/40
          transition-all duration-300
        `}
      />

      {/* ❌ Clear Button */}
      {internalValue && (
        <button
          onClick={() => {
            setInternalValue("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
