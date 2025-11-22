import React, { useEffect, useRef, useState } from "react";

/**
 * Travel-Themed Ultra-Premium Background
 * Includes:
 * ✔ Parallax scroll effect
 * ✔ Mouse-follow blob effect
 * ✔ Soft noise + depth fog
 * ✔ Glassmorphism floating cards
 * ✔ Performance auto-throttle
 * ✔ 3D tilt (gyroscope + mouse)
 * ✔ Time-based travel gradients (morning/noon/sunset/night)
 * ✔ Rotating 3D globe
 * ✔ Floating travel icons (plane, palm, boat)
 * ✔ Stars + Milky Way at night
 * ✔ Weather overlays (rain / snow / clouds) based on time
 */
export default function AnimatedBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [heavyMode, setHeavyMode] = useState(true);

  // Detect if we should reduce effects (low-end / user preference)
  useEffect(() => {
    let reduce = false;

    if (typeof window === "undefined") return;

    const prefersReduced =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Save-data mode
    const anyNav = navigator as any;
    const saveData = anyNav?.connection?.saveData;

    // Low memory devices (if supported)
    const lowMemory =
      typeof anyNav.deviceMemory === "number" && anyNav.deviceMemory < 3;

    // Mobile devices (reduce animations for performance)
    const isMobile = window.innerWidth < 768;

    if (prefersReduced || saveData || lowMemory || isMobile) {
      reduce = true;
    }

    setHeavyMode(!reduce);
  }, []);

  // Time-of-day gradient, weather, tilt & parallax/mouse binding
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // --- Time-based gradient + weather / night sky ---
    const hour = new Date().getHours();
    let timeClass = "travel-morning";
    let weatherClass = "weather-clouds"; // default

    if (hour >= 6 && hour < 11) {
      timeClass = "travel-morning";
      weatherClass = "weather-clouds";
    } else if (hour >= 11 && hour < 16) {
      timeClass = "travel-noon";
      weatherClass = "weather-clear";
    } else if (hour >= 16 && hour < 20) {
      timeClass = "travel-sunset";
      weatherClass = "weather-rain";
    } else {
      timeClass = "travel-night";
      weatherClass = "weather-stars";
    }

    el.classList.add(timeClass, weatherClass);
    if (timeClass === "travel-night") el.classList.add("night-sky");

    if (!heavyMode) return; // don't bind heavy effects on reduced mode

    // --- Mouse-based tilt + mouse-follow blob offset (throttled) ---
    let rafId: number | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      if (rafId) return; // Skip if we have a pending frame
      
      rafId = requestAnimationFrame(() => {
        const xNorm = e.clientX / window.innerWidth - 0.5;
        const yNorm = e.clientY / window.innerHeight - 0.5;

        const tiltX = yNorm * -5; // Reduced intensity for stability
        const tiltY = xNorm * 5;

        el.style.setProperty("--tilt-x", `${tiltX}deg`);
        el.style.setProperty("--tilt-y", `${tiltY}deg`);

        // mouse-follow offset for blobs (reduced intensity)
        el.style.setProperty("--mouse-x", `${xNorm * 20}px`);
        el.style.setProperty("--mouse-y", `${yNorm * 20}px`);
        
        rafId = null;
      });
    };

    // --- Gyroscope tilt (mobile) ---
    let gyroRafId: number | null = null;
    const handleGyro = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      if (gyroRafId) return;
      
      gyroRafId = requestAnimationFrame(() => {
        const tiltX = event.beta! / 16; // Reduced intensity for stability
        const tiltY = event.gamma! / 16;
        el.style.setProperty("--tilt-x", `${tiltX}deg`);
        el.style.setProperty("--tilt-y", `${tiltY}deg`);
        gyroRafId = null;
      });
    };

    // --- Parallax scroll (throttled) ---
    let scrollRafId: number | null = null;
    const handleScroll = () => {
      if (scrollRafId) return;
      
      scrollRafId = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const maxScroll = doc.scrollHeight - window.innerHeight;
        if (maxScroll <= 0) {
          scrollRafId = null;
          return;
        }

        const ratio = window.scrollY / maxScroll;
        const parallax = ratio * 20; // Reduced intensity for stability
        el.style.setProperty("--scroll-parallax", `${parallax}px`);
        scrollRafId = null;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("deviceorientation", handleGyro);
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Trigger initial state
    handleScroll();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("deviceorientation", handleGyro);
      window.removeEventListener("scroll", handleScroll);
      
      // Cancel any pending animation frames
      if (rafId) cancelAnimationFrame(rafId);
      if (gyroRafId) cancelAnimationFrame(gyroRafId);
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
    };
  }, [heavyMode]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="
        pointer-events-none fixed inset-0 -z-10
        travel-bg-base overflow-hidden
      "
    >
      {/* Rotating 3D globe (only meaningful in heavy mode, but cheap anyway) */}
      {heavyMode && <div className="travel-globe" />}

      {/* Night stars & Milky Way layer */}
      <div className="stars-layer" />

      {/* Weather overlays */}
      <div className="weather-layer weather-rain" />
      <div className="weather-layer weather-snow" />
      <div className="weather-layer weather-clouds" />

      {/* Depth fog layers */}
      <div className="fog-layer fog-1" />
      <div className="fog-layer fog-2" />
      <div className="fog-layer fog-3" />

      {/* Glowing travel blobs */}
      <div className="travel-blob blob-1" />
      <div className="travel-blob blob-2" />
      <div className="travel-blob blob-3 mouse-reactive-blob" />

      {/* Floating travel icons */}
      {heavyMode && (
        <>
          <div className="floating-icon icon-plane">✈️</div>
          <div className="floating-icon icon-palm">🌴</div>
          <div className="floating-icon icon-boat">⛵</div>
        </>
      )}

      {/* Glassmorphism floating cards (subtle, behind content) */}
      {heavyMode && (
        <>
          <div className="glass-card glass-card-1" />
          <div className="glass-card glass-card-2" />
        </>
      )}
    </div>
  );
}
