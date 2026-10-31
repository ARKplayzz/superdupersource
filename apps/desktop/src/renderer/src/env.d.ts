/// <reference types="vite/client" />
import type { SdsApi } from '../../shared/api'

declare global {
  interface Window {
    sds: SdsApi
  }
}
