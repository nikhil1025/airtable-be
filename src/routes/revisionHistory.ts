import { Router } from "express";
import {
  fetchRevisionHistoriesForUser,
  getAllRevisionsFlat,
  getRecordRevisions,
  getRevisionHistoriesForUser,
  getRevisionsByFilter,
  scrapeSingleRecord,
} from "../controllers/revisionHistoryFetchController";

const router = Router();

router.get("/fetch/:userId", fetchRevisionHistoriesForUser);
router.get("/user/:userId", getRevisionHistoriesForUser);
router.get("/all/:userId", getAllRevisionsFlat);
router.get("/record/:recordId", getRecordRevisions);
router.get("/filter", getRevisionsByFilter);
router.post("/scrape/record", scrapeSingleRecord);

export default router;
