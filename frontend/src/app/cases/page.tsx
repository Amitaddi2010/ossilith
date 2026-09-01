'use client';

import React, { useEffect } from 'react';
import HomePage from '../page';

export default function CasesPage() {
  useEffect(() => {
    // Immediate and frame-delayed scroll to guarantee active cases section is centered
    const scrollToCases = () => {
      const el = document.getElementById('active-cases');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const timer1 = setTimeout(scrollToCases, 80);
    const timer2 = setTimeout(scrollToCases, 250);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return <HomePage />;
}
