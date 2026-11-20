"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublicWebsiteRouter = createPublicWebsiteRouter;
const express_1 = __importStar(require("express"));
const path_1 = __importDefault(require("path"));
/** Issue99 UI candidate: synthetic fixtures only, no database or session dependency. */
function createPublicWebsiteRouter(assetRoot = path_1.default.resolve(__dirname, '../../public/public-v4')) {
    const router = (0, express_1.Router)();
    router.get(['/', '/index.php', '/public-v4', '/public-v4/'], (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.sendFile(path_1.default.join(assetRoot, 'index.html'));
    });
    router.use('/public-v4', express_1.default.static(assetRoot, {
        index: false, dotfiles: 'deny', fallthrough: true, maxAge: 0,
        setHeaders: res => { res.setHeader('X-Content-Type-Options', 'nosniff'); }
    }));
    return router;
}
