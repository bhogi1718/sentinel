import { AuthenticatedUser } from "../modules/auth/auth.types";
import { OrgDevice } from "../modules/device/device.types";
import { OrgContext } from "../modules/organization/organization.types";

declare global {
  namespace Express {
    interface Request {
      /// Set by authGuard.
      user?: AuthenticatedUser;
      /// Set by orgContext: the organization in the URL and the caller's role in it.
      org?: OrgContext;
      /// Set by deviceContext: the device in the URL, already confirmed to belong to req.org.
      device?: OrgDevice;
    }
  }
}

export {};
