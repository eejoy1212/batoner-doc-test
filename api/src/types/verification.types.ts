export type UploadedFileMetadata = {
  originalname: string;
  mimetype: string;
  size: number;
};

export type ParsedField = {
  value: string | null;
  confidence: number | null;
  needsReview: boolean;
};

export type ParsedResult = {
  principalName: ParsedField;
  agentName: ParsedField;
  submissionInstitution: ParsedField;
  purposeCourtName: ParsedField;
  caseNumber: ParsedField;
  itemName: ParsedField;
};
