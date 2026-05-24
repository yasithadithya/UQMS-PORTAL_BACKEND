import mongoose, { Schema, Document } from 'mongoose';

// Interface for the Surveyor & Fee details specific to a single visit
export interface ISurveyorAssignment {
    surveyorId?: mongoose.Types.ObjectId; // References User/Surveyor model
    currency?: string;
    specialAttendanceFees?: number;
}

// Interface for the Visit Details Grid (now containing its own surveyor details)
export interface IVisitDetail {
    visitNo?: string;
    visitDate: Date;
    startSurvey?: string;
    endSurvey?: string;
    location?: string;
    status?: string;
    surveyorAssignments: ISurveyorAssignment[]; // Nested array per visit
}

// Main Interface for First Entry Survey Booking
export interface IFirstEntrySurveyBooking extends Document {
    // Left Column Fields
    vesselId?: mongoose.Types.ObjectId; // Links directly to your Vessel model
    shipName: string;
    requestedBy?: string;
    portOfSurvey?: string;
    reportNo?: string;
    portOfRegistry?: string;
    flag?: string;
    shipType?: string;
    shipBuilder?: string;
    engineBuilder?: string;
    duallyClassWith?: string;
    dwt?: number;                      // Maps to Vessel's deadweight
    keelDate?: Date;

    // Right Column Fields
    uqmsNo?: string;                   // Replaced irNo with uqmsNo
    requestedDate: Date;
    surveyMode: string;
    society?: string;
    managedBy?: string;
    buildDate?: Date;                  // Maps to Vessel's dateOfBuild
    yardNo?: string;
    officialNo?: string;
    gt?: number;                       // Maps to Vessel's grossTonnage
    callSign?: string;

    // Grid / Sub-section Arrays
    visitDetails: IVisitDetail[];
    surveysRequested: string[];        // Array of survey names/IDs requested for this booking
    requestIds?: mongoose.Types.ObjectId[];

    // Metadata
    status: string;
    companyId?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

// 1. Sub-Schema for Surveyor Assignments
const surveyorAssignmentSchema = new Schema<ISurveyorAssignment>({
    surveyorId: { type: Schema.Types.ObjectId, ref: 'User' }, 
    currency: { type: String, trim: true },
    specialAttendanceFees: { type: Number, default: 0 }
});

// 2. Sub-Schema for Visit Details (Houses the surveyor assignments array)
const visitDetailSchema = new Schema<IVisitDetail>({
    visitNo: { type: String, trim: true },
    visitDate: { type: Date, required: true },
    startSurvey: { type: String, trim: true },
    endSurvey: { type: String, trim: true },
    location: { type: String, trim: true },
    status: { type: String, trim: true },
    surveyorAssignments: [surveyorAssignmentSchema] // Array nested inside the visit row
});

// 3. Main Booking Schema
const firstEntrySurveyBookingSchema: Schema = new Schema(
    {
        vesselId: { type: Schema.Types.ObjectId, ref: 'Vessel' },
        
        // Form Fields (Left Pane)
        shipName: { type: String, required: [true, 'Ship Name is required'], trim: true },
        requestedBy: { type: String, trim: true },
        portOfSurvey: { type: String, trim: true },
        reportNo: { type: String, trim: true },
        portOfRegistry: { type: String, trim: true },
        flag: { type: String, trim: true },
        shipType: { type: String, trim: true },
        shipBuilder: { type: String, trim: true },
        engineBuilder: { type: String, trim: true },
        duallyClassWith: { type: String, trim: true },
        dwt: { type: Number },
        keelDate: { type: Date },

        // Form Fields (Right Pane)
        uqmsNo: { type: String, trim: true }, // Replaced irNo with uqmsNo
        requestedDate: { type: Date, required: true, default: Date.now },
        surveyMode: { type: String, trim: true, default: 'Singly' },
        society: { type: String, trim: true },
        managedBy: { type: String, trim: true },
        buildDate: { type: Date },
        yardNo: { type: String, trim: true },
        officialNo: { type: String, trim: true },
        gt: { type: Number },
        callSign: { type: String, trim: true },

        // Master Grid Data arrays
        visitDetails: [visitDetailSchema],
        surveysRequested: [{ type: String, trim: true }], 
        requestIds: [{ type: Schema.Types.ObjectId, ref: 'Request' }],

        // Metadata & Controls
        companyId: { type: String, trim: true },
        status: { type: String, trim: true, default: 'active' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    {
        timestamps: true,
    }
);

const FirstEntrySurveyBooking = mongoose.model<IFirstEntrySurveyBooking>('FirstEntrySurveyBooking', firstEntrySurveyBookingSchema);

export default FirstEntrySurveyBooking;
