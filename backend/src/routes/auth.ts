import { Router } from "express";
import appleSignin from "apple-signin-auth";
import { createAnonymousUser, findOrCreateAppleUser, mergeAnonymousIntoApple } from "../repositories/users.js";
import { generateTokens, verifyRefreshToken, verifyAccessToken } from "../services/auth.js";

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/anonymous", async (req, res) => {
    try {
      const userId = await createAnonymousUser();
      const tokens = generateTokens(userId, "anonymous");
      res.json({ userId, ...tokens });
    } catch (error) {
      console.error("Failed to create anonymous user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  router.post("/apple", async (req, res) => {
    const { identityToken } = req.body;
    if (!identityToken) {
      res.status(400).json({ error: "Missing identityToken" });
      return;
    }

    try {
      const applePayload = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_CLIENT_ID,
      });
      const appleUserId = applePayload.sub;
      const { userId, created } = await findOrCreateAppleUser(appleUserId);
      const tokens = generateTokens(userId, "apple");
      res.json({ userId, created, ...tokens });
    } catch (error) {
      console.error("Apple sign-in failed:", error);
      res.status(401).json({ error: "Invalid Apple identity token" });
    }
  });

  router.post("/merge", async (req, res) => {
    const { anonymousToken, identityToken } = req.body;
    if (!anonymousToken || !identityToken) {
      res.status(400).json({ error: "Missing anonymousToken or identityToken" });
      return;
    }

    try {
      const anonPayload = verifyAccessToken(anonymousToken);
      const applePayload = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_CLIENT_ID,
      });
      const { userId: appleUserId } = await findOrCreateAppleUser(applePayload.sub);
      await mergeAnonymousIntoApple(anonPayload.userId, appleUserId);
      const tokens = generateTokens(appleUserId, "apple");
      res.json({ userId: appleUserId, ...tokens });
    } catch (error) {
      console.error("Merge failed:", error);
      res.status(500).json({ error: "Failed to merge accounts" });
    }
  });

  router.post("/refresh", async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Missing refreshToken" });
      return;
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      const tokens = generateTokens(payload.userId, payload.authType);
      res.json({ accessToken: tokens.accessToken });
    } catch (error) {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  });

  return router;
}
