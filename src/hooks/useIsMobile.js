import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the user is on a mobile device
 * Uses both user agent detection AND screen width check (<=768px)
 * Returns true if EITHER condition is met
 */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    // Initial detection
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    const isNarrowScreen = window.innerWidth <= 768;
    return isMobileUA || isNarrowScreen;
  });

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const isNarrowScreen = window.innerWidth <= 768;
      setIsMobile(isMobileUA || isNarrowScreen);
    };

    // Check on resize
    window.addEventListener('resize', checkMobile);
    
    // Initial check
    checkMobile();

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

export default useIsMobile;


