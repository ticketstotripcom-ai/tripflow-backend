let cachedAudio: HTMLAudioElement | null = null;
export const playSound = () => {
  try {
    const ensure = () => {
      if (!cachedAudio) {
        cachedAudio = new Audio('/sounds/notify.wav');
        cachedAudio.preload = 'auto';
        cachedAudio.volume = 1.0;
      }
    };
    ensure();
    const doPlay = async () => {
      if (!cachedAudio) return;
      try {
        cachedAudio.currentTime = 0;
        await cachedAudio.play();
      } catch {}
    };
    void doPlay();
  } catch {}
};

export const vibrate = () => {
  try {
    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
  } catch {}
};

