import mongoose, { Schema, Document } from 'mongoose';

export interface INoteItem {
    noteCategory: string; // e.g. 'Additional Information' or 'Statutory Conditions'
    noteCode: string;
    description: string;
    type: 'Hull' | 'Machinery' | 'Equipment';
    status: 'new' | 'modified' | 'deleted' | 'retained';
    dueDate?: Date;
}

export interface INote extends Document {
    vesselId: mongoose.Types.ObjectId;
    notes: INoteItem[];
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const noteItemSchema = new Schema<INoteItem>({
    noteCategory: {
        type: String,
        required: [true, 'Note category is required'],
        enum: ['Additional Information', 'Statutory Conditions'],
        trim: true
    },
    noteCode: {
        type: String,
        required: [true, 'Note code is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true
    },
    type: {
        type: String,
        required: [true, 'Type is required'],
        enum: ['Hull', 'Machinery', 'Equipment'],
        trim: true
    },
    status: {
        type: String,
        required: [true, 'Status is required'],
        enum: ['new', 'modified', 'deleted', 'retained'],
        default: 'new',
        trim: true
    },
    dueDate: {
        type: Date
    }
});

const noteSchema: Schema = new Schema(
    {
        vesselId: {
            type: Schema.Types.ObjectId,
            ref: 'Vessel',
            required: [true, 'Vessel ID reference is required'],
            unique: true
        },
        notes: {
            type: [noteItemSchema],
            default: []
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
);

const Note = mongoose.model<INote>('Note', noteSchema);

export default Note;
