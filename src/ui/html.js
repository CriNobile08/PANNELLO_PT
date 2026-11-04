import { h } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);
export { useState, useEffect, useMemo, useContext, useRef } from 'preact/hooks';
