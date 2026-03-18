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
  memberName: ParsedField;
  usage: ParsedField;
  submitInstitution: ParsedField;
  delegatedPerson: ParsedField;
};
