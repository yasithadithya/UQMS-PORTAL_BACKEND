import mongoose, { Schema, Document } from 'mongoose';

export interface IRecEquipQues extends Document {
  codeRefNo: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const recEquipQuesSchema: Schema = new Schema(
  {
    codeRefNo: {
      type: String,
      required: [true, 'Code Ref. No is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const RecEquipQues = mongoose.model<IRecEquipQues>('RecEquipQues', recEquipQuesSchema);

export default RecEquipQues;
