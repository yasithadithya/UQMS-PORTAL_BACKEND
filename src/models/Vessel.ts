import mongoose, { Schema, Document } from 'mongoose';

export interface IVessel extends Document {
    uqmsNumber?: string;
    imoNumber?: string;
    vesselCode?: string;
    vesselName: string;
    vesselType?: mongoose.Types.ObjectId;
    areaOfOperation?: mongoose.Types.ObjectId;
    description?: string;
    callSign?: string;
    flag?: string;
    portOfRegistry?: string;
    dateOfRegistry?: Date;
    classNotationHull?: string;
    classNotationMachinery?: string;
    grossTonnage?: number;
    netTonnage?: number;
    deadweight?: number;
    lightship?: number;
    overallLength?: number;
    lbp?: number;
    length?: number;
    breadth?: number;
    draught?: number;
    ballastWtrCapacity?: number;
    material?: string;
    builder?: string;
    placeOfBuilt?: string;
    yardNo?: string;
    dateOfBuild?: Date;
    keelDate?: Date;
    buildingContractDate?: Date;
    majorConversionDate?: Date;
    depth?: number;
    freeboard?: number;
    equipmentLtr?: string;
    chainQualityType?: string;
    mainEngineModel?: string;
    noOfEngines?: number;
    totalPower?: number;
    stroke?: string;
    engineBuilder?: string;
    engineBuilt?: string;
    propeller?: string;
    speed?: number;
    rpm?: number;
    electricalInstallation?: string;
    boilers?: string;
    sisterShips?: mongoose.Types.ObjectId[];
    registeredOwnerName?: string;
    registeredOwnerAddress?: string;
    invoicingName?: string;
    invoicingAddress?: string;
    managerName?: string;
    managerAddress?: string;
    companyId?: string;
    status?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const vesselSchema: Schema = new Schema(
    {
        uqmsNumber: { type: String, trim: true },
        imoNumber: { type: String, trim: true },
        vesselCode: { type: String, trim: true },
        vesselName: { type: String, required: [true, 'Vessel name is required'], trim: true },
        vesselType: { type: Schema.Types.ObjectId, ref: 'VesselType' },
        areaOfOperation: { type: Schema.Types.ObjectId, ref: 'AreaOfOperation' },
        description: { type: String, trim: true },
        callSign: { type: String, trim: true },
        flag: { type: String, trim: true },
        portOfRegistry: { type: String, trim: true },
        dateOfRegistry: { type: Date },
        classNotationHull: { type: String, trim: true },
        classNotationMachinery: { type: String, trim: true },
        grossTonnage: { type: Number },
        netTonnage: { type: Number },
        deadweight: { type: Number },
        lightship: { type: Number },
        overallLength: { type: Number },
        lbp: { type: Number },
        length: { type: Number },
        breadth: { type: Number },
        draught: { type: Number },
        ballastWtrCapacity: { type: Number },
        material: { type: String, trim: true },
        builder: { type: String, trim: true },
        placeOfBuilt: { type: String, trim: true },
        yardNo: { type: String, trim: true },
        dateOfBuild: { type: Date },
        keelDate: { type: Date },
        buildingContractDate: { type: Date },
        majorConversionDate: { type: Date },
        depth: { type: Number },
        freeboard: { type: Number },
        equipmentLtr: { type: String, trim: true },
        chainQualityType: { type: String, trim: true },
        mainEngineModel: { type: String, trim: true },
        noOfEngines: { type: Number },
        totalPower: { type: Number },
        stroke: { type: String, trim: true },
        engineBuilder: { type: String, trim: true },
        engineBuilt: { type: String, trim: true },
        propeller: { type: String, trim: true },
        speed: { type: Number },
        rpm: { type: Number },
        electricalInstallation: { type: String, trim: true },
        boilers: { type: String, trim: true },
        sisterShips: [{ type: Schema.Types.ObjectId, ref: 'Vessel' }],
        registeredOwnerName: { type: String, trim: true },
        registeredOwnerAddress: { type: String, trim: true },
        invoicingName: { type: String, trim: true },
        invoicingAddress: { type: String, trim: true },
        managerName: { type: String, trim: true },
        managerAddress: { type: String, trim: true },
        companyId: { type: String, trim: true },
        status: { type: String, trim: true, default: 'active' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    {
        timestamps: true,
    }
);

const Vessel = mongoose.model<IVessel>('Vessel', vesselSchema);

export default Vessel;