"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.localContentRoot = localContentRoot;
exports.skipLocalInitialization = skipLocalInitialization;
const path_1 = __importDefault(require("path"));
/** Explicit development-only relocation; never changes production paths/startup. */
function localContentRoot(defaultRoot) {
    const configured = process.env.NODE_ENV === 'development' ? process.env.FOOTBALL_LOCAL_CONTENT_ROOT : undefined;
    if (!configured)
        return defaultRoot;
    if (!path_1.default.isAbsolute(configured))
        throw new Error('FOOTBALL_LOCAL_CONTENT_ROOT must be absolute');
    return path_1.default.resolve(configured);
}
function skipLocalInitialization() {
    return process.env.NODE_ENV === 'development' && process.env.FOOTBALL_LOCAL_SKIP_INIT === 'true';
}
