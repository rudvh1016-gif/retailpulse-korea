import {defineConfig} from '@playwright/test';
import base from './playwright.config';
// Normal PR CI only. No deploy, providers, credentials or local browser execution.
export default defineConfig({...base,testMatch:'**/content-theme-preview.spec.ts',workers:2,retries:0,outputDir:'content-theme-results'});
