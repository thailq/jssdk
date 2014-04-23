define(['backbone', 'jssdk/sdk/squid_api'], function(Backbone, squid_api) {

    var controller = {

        fakeServer: null,

        /**
         * Create (and execute) a new AnalysisJob.
         */
        createAnalysisJob: function(analysisModel, filters) {

            analysisModel.set({
                readyStatus: false
            }, {silent : true});
            
            analysisModel.set("results", null);
    
            var userSelection;
            if (filters) {
                userSelection = filters.get("selection");
            } else {
                userSelection =  analysisModel.get("selection");
            }

            // create a new AnalysisJob
            var analysisJob = new controller.ProjectAnalysisJob();
            var projectId;
            if (analysisModel.id.projectId) {
                projectId = analysisModel.id.projectId;
            } else {
                projectId = analysisModel.get("projectId");
            }
            analysisJob.set("id", {
                    projectId: projectId,
                    analysisJobId: null});
            analysisJob.set("domains", analysisModel.get("domains"));
            analysisJob.set("dimensions", analysisModel.get("dimensions"));
            analysisJob.set("metrics", analysisModel.get("metrics"));
            analysisJob.set("autoRun", analysisModel.get("autoRun"));
            analysisJob.set("selection", userSelection);
            analysisJob.set("error", null);

            // save the analysisJob to API
            analysisJob.save({}, {
                error: function(model, response) {
                	console.log("createAnalysis error");
                    squid_api.model.error.set("errorMessage", response);
                    analysisModel.set("status", model.get("status"));
                    analysisModel.set("error", model.get("error"));
                    analysisModel.set("results", model.get("results"));
                    analysisModel.set({"readyStatus": true});
                    analysisModel.set("jobId", model.get("id"));
                },
                success : function(model, response) {
                    console.log("createAnalysis success");
                    squid_api.model.error.set("errorMessage", null);
                    analysisModel.set("status", model.get("status"));
                    analysisModel.set("error", model.get("error"));
                    analysisModel.set("results", model.get("results"));
                    analysisModel.set({"readyStatus": true});
                    analysisModel.set("jobId", model.get("id"));
                }
            });
            if (this.fakeServer) {
                this.fakeServer.respond();
            }
        },

        /**
         * Create (and execute) a new AnalysisJob, then retrieve the results.
         */
        computeAnalysis: function(analysisModel, filters) {
            var me = this;
            analysisModel.once("change:jobId", function() {
                me.getAnalysisJobResults(analysisModel, filters);
            });
            this.createAnalysisJob(analysisModel, filters);
        },
        
        /**
         * Create (and execute) a new MultiAnalysisJob, retrieve the results 
         * and set the 'done' or 'error' attribute to true when all analysis are done or any failed.
         */
        computeMultiAnalysis: function(multiAnalysisModel, filters) {
            var me = this;
            multiAnalysisModel.set({"done": false, "error": false},{"silent":true});
            var analyses = multiAnalysisModel.get("analyses");
            var analysesCount = analyses.length;
            var analysesPendingCount = analysesCount;
            for (var i=0; i<analysesCount; i++) {
            	var analysisModel = analyses[i];
	            analysisModel.once("change:jobId", function(model) {
	            	model.on("change", function() {
	            		if (model.get("error") != null) {
	            			multiAnalysisModel.set("error", true);
	            		} else {
	            			if (model.get("results") != null) {
	            				analysesPendingCount--;
	    	            		if (analysesPendingCount == 0) {
	    	            			multiAnalysisModel.set("done", true);
	    	            		}
	            			}
	            		}
	            	});
	                me.getAnalysisJobResults(model, filters);
	            });
	            this.createAnalysisJob(analysisModel, filters);
            }
        },
        
        /**
         * retrieve the results.
         */
        getAnalysisJobResults: function(analysisModel, filters) {
        	if (analysisModel.get("status") != "DONE") {
                console.log("getAnalysisJobResults");
                var analysisJobResult = new controller.ProjectAnalysisJobResult();
                analysisJobResult.set("id", analysisModel.get("jobId"));

                analysisJobResult.on("change", function(event) {
                    // update the analysis Model
                    if (event.get("error") == null) {
                    	var results = event.toJSON();
                    	console.log("getAnalysisResults # rows : "+results.rows.length);
                    	analysisModel.set({"results" : results});
                    } else {
                    	console.log("getAnalysisResults error : "+event.get("error"));
                    	analysisModel.set({"error" : event.get("error")});
            		}
                    squid_api.model.error.set("errorMessage", null);
                }, this);

                // get the results from API
                analysisJobResult.fetch({
                    error: function(model, error) {
                        squid_api.model.error.set("errorMessage", error);
                        analysisModel.set("error", {message : error.statusText});
                    },
                    success: function() {}
                });
                if (this.fakeServer) {
                    this.fakeServer.respond();
                }
            }
        },

        AnalysisModel: Backbone.Model.extend({
            results: null,
            
            setProjectId : function(projectId) {
                this.set("id", {
                        "projectId": projectId,
                        "analysisJobId": null
                });
                return this;
            },
            
            setDomainIds : function(domainIdList) {
                var domains = [];
                for (var i=0; i<domainIdList.length; i++) {
                    domains.push({
                        "projectId": this.get("id").projectId,
                        "domainId": domainIdList[i]
                    });
                }
                this.set("domains", domains);
                return this;
            },
            
            setDimensionIds : function(dimensionIdList) {
                var dims = [];
                for (var i=0; i<dimensionIdList.length; i++) {
                    dims.push({
                        "projectId": this.get("id").projectId,
                        "domainId": this.get("domains")[0].domainId,
                        "dimensionId": dimensionIdList[i]
                    });
                }
                this.set("dimensions", dims);
                return this;
            },
            
            setMetricIds : function(metricIdList) {
                var metrics = [];
                for (var i=0; i<metricIdList.length; i++) {
                    metrics.push({
                        "projectId": this.get("id").projectId,
                        "domainId": this.get("domains")[0].domainId,
                        "metricId": metricIdList[i]
                    });
                }
                this.set("metrics", metrics);
                return this;
            }
        }),
        
        MultiAnalysisModel: Backbone.Model.extend({
        	analyses : null,
        	done : false,
        	error: false
        })

    };
    
    // ProjectAnalysisJob Model
    controller.ProjectAnalysisJob = squid_api.model.ProjectModel.extend({
            urlRoot: function() {
                return squid_api.model.ProjectModel.prototype.urlRoot.apply(this, arguments) + "/analysisjobs/" + (this.id.analysisJobId === null ? "" : this.id.analysisJobId);
            },
            error: null,
            domains: null,
            dimensions: null,
            metrics: null,
            selection: null
        });

    // ProjectAnalysisJobResult Model
    controller.ProjectAnalysisJobResult = controller.ProjectAnalysisJob.extend({
            urlRoot: function() {
                return controller.ProjectAnalysisJob.prototype.urlRoot.apply(this, arguments) + "/results" + "?" + "compression="+this.compression+ "&"+"format="+this.format;
            },
            error: null,
            format: "json",
            compression: "none"
        });

    return controller;
});